import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { badRequest } from "@/lib/apiResponse"
import { dueReminderWhere, DUE_REMINDER_TAKE } from "@/lib/reminderWindow"
import { isPushConfigured, sendPush, type SendOutcome } from "@/lib/webPush"

/**
 * Background reminder delivery: the only channel that works with every client
 * closed.
 *
 * HOW IT FITS THE EXISTING DESIGN. A reminder fires exactly once, and
 * `dispatchedAt` is the claim that makes it so. Three channels race for that
 * claim — an open web tab, the Android poller, and now this — and whichever
 * gets there first is the one that notifies. That race already existed between
 * the first two; push is a third runner, not a new mechanism.
 *
 * THE RULE THAT MATTERS MOST: nothing is claimed unless a push was actually
 * accepted for it. A user with no subscription, a deployment with no VAPID
 * keys, a push service that is down — in every one of those cases this must
 * leave `dispatchedAt` alone, or it silently swallows reminders that the open
 * tab or the phone would otherwise have shown. `dispatchedAt` is one-way; there
 * is no undo for claiming something you never delivered.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
})

export async function saveSubscription(
  userId: string,
  input: unknown,
  userAgent?: string | null,
) {
  const parsed = subscriptionSchema.safeParse(input)
  if (!parsed.success) throw badRequest("Invalid subscription", parsed.error.errors)
  const { endpoint, keys } = parsed.data

  // Upsert on the ENDPOINT, which is globally unique. A browser hands back the
  // same endpoint every time until its site data is cleared, so an insert would
  // accumulate a row per visit and every reminder would arrive N times.
  //
  // `userId` is in the update, not only the create: the same browser signing in
  // as somebody else must move to that account rather than keep pushing the
  // previous user's reminders to a machine they may no longer be using.
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
    update: {
      userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  })
  return { success: true, id: sub.id }
}

export async function deleteSubscription(userId: string, input: unknown) {
  const parsed = z.object({ endpoint: z.string().min(1).max(2000) }).safeParse(input)
  if (!parsed.success) throw badRequest("Invalid input", parsed.error.errors)
  // Scoped to the user even though the endpoint is unique, so one account can
  // never unsubscribe another's browser by quoting its endpoint.
  const res = await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId },
  })
  return { success: true, count: res.count }
}

export async function listSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    // The key material is deliberately NOT selected. Nothing in the UI needs it
    // and an endpoint plus keys is everything required to push to that browser.
    select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastSuccessAt: true },
    orderBy: { createdAt: "desc" },
  })
}

export interface DispatchSummary {
  /** Users examined — i.e. those with at least one subscription. */
  users: number
  /** Reminders a push was accepted for, and therefore claimed. */
  delivered: number
  /** Subscriptions removed because the push service said they were gone. */
  pruned: number
  /** Reminders left unclaimed because every send for them failed. */
  deferred: number
  /** True when the deployment has no VAPID keys, so nothing was attempted. */
  skipped?: boolean
}

/**
 * Send a push for every reminder that is due right now, then claim the ones
 * that got through.
 *
 * Called by a scheduler that is EXTERNAL to the app — see
 * `POST /api/cron/reminders`. Nothing inside a Next.js process can be relied on
 * to run on a timer: `next start` may be restarted, scaled to several instances,
 * or deployed serverless where no process outlives a request. A cron line is the
 * one mechanism that works in all three.
 *
 * Safe to run concurrently with itself and with the other two channels. The
 * worst a double run can do is send the same push twice in the window between
 * the send and the claim, which is a duplicate notification — not a lost one.
 */
export async function dispatchDuePushes(now: Date = new Date()): Promise<DispatchSummary> {
  const empty: DispatchSummary = { users: 0, delivered: 0, pruned: 0, deferred: 0 }
  // A deployment with no keys is a valid deployment. Returning early — rather
  // than erroring — is what keeps the cron line harmless for people who never
  // turned push on.
  if (!isPushConfigured()) return { ...empty, skipped: true }

  const subs = await prisma.pushSubscription.findMany()
  if (subs.length === 0) return empty

  const byUser = new Map<string, typeof subs>()
  for (const s of subs) {
    const list = byUser.get(s.userId)
    if (list) list.push(s)
    else byUser.set(s.userId, [s])
  }

  const summary: DispatchSummary = { ...empty, users: byUser.size }
  const deadEndpoints: string[] = []
  const liveEndpoints: string[] = []
  const claimIds: string[] = []

  for (const [userId, userSubs] of byUser) {
    // The SAME "due" query the tab and the phone use. It lives in one file
    // because these three definitions drifted once already, and the copy that
    // drifted was the one feeding notifications.
    const due = await prisma.reminder.findMany({
      where: dueReminderWhere(userId, now),
      orderBy: { triggerAt: "asc" },
      include: { task: { select: { id: true, title: true } } },
      take: DUE_REMINDER_TAKE,
    })
    if (due.length === 0) continue

    for (const reminder of due) {
      const payload = {
        type: "reminder" as const,
        reminderId: reminder.id,
        taskId: reminder.taskId,
        title: reminder.task?.title ?? "Task",
      }

      const outcomes: SendOutcome[] = await Promise.all(
        userSubs.map((s) =>
          sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload),
        ),
      )

      let anySent = false
      outcomes.forEach((outcome, i) => {
        const endpoint = userSubs[i].endpoint
        if (outcome.status === "sent") {
          anySent = true
          liveEndpoints.push(endpoint)
        } else if (outcome.status === "gone") {
          deadEndpoints.push(endpoint)
        }
      })

      // ONE accepted send is enough to claim. Requiring all of them would mean a
      // single dead laptop subscription kept re-notifying the phone every minute;
      // requiring none would claim reminders nobody received.
      if (anySent) claimIds.push(reminder.id)
      else summary.deferred++
    }
  }

  if (deadEndpoints.length > 0) {
    // Deleted, not disabled. A dead endpoint never comes back — the browser
    // mints a new one if the user re-subscribes — so keeping the row would only
    // guarantee a failed send every minute forever.
    const res = await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: deadEndpoints } },
    })
    summary.pruned = res.count
  }

  if (liveEndpoints.length > 0) {
    await prisma.pushSubscription.updateMany({
      where: { endpoint: { in: Array.from(new Set(liveEndpoints)) } },
      data: { lastSuccessAt: now },
    })
  }

  if (claimIds.length > 0) {
    // Claimed only now, and only for reminders a push was accepted for. The
    // `dispatchedAt: null` guard makes a concurrent run (or an open tab that
    // claimed the same reminder a moment ago) a no-op rather than a double
    // count.
    const res = await prisma.reminder.updateMany({
      where: { id: { in: claimIds }, dispatchedAt: null },
      data: { dispatchedAt: now },
    })
    summary.delivered = res.count
  }

  return summary
}
