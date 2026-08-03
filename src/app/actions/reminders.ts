"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { dueReminderWhere, DUE_REMINDER_TAKE } from "@/lib/reminderWindow"

/**
 * Reminder dispatch queries. The in-app ReminderDispatcher (a client component
 * mounted in the layout) polls getDueReminders while the app is open, shows a
 * Web Notification + banner, then calls markRemindersDispatched so each fires
 * once. Background delivery when the app is closed would need a service worker +
 * Web Push (a future upgrade); the persisted triggerAt/dispatchedAt already support it.
 */

/** Fired-and-undispatched reminders for the session user, soonest first. */
export async function getDueReminders() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    // Bounds live in lib/reminderWindow.ts so this and the mobile service cannot
    // drift again — they already had, and the unbounded copy was the one the
    // Android notification poller called.
    return await prisma.reminder.findMany({
      where: dueReminderWhere(userId),
      orderBy: { triggerAt: "asc" },
      include: { task: { select: { id: true, title: true } } },
      take: DUE_REMINDER_TAKE,
    })
  } catch {
    return []
  }
}

/** Mark reminders dispatched so the dispatch query stops surfacing them. */
export async function markRemindersDispatched(ids: string[]) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 }

  try {
    // Scoped to the caller's own reminders, so foreign ids are no-ops.
    const res = await prisma.reminder.updateMany({
      where: { id: { in: ids.slice(0, 500) }, userId },
      data: { dispatchedAt: new Date() },
    })
    return { success: true, count: res.count }
  } catch {
    return { error: "Failed to mark reminders" }
  }
}
