import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { badRequest } from "@/lib/apiResponse"
import { dueReminderWhere, DUE_REMINDER_TAKE } from "@/lib/reminderWindow"

/** Reminder dispatch queries for the mobile API — mirrors `src/app/actions/reminders.ts`. */

export async function getDueReminders(userId: string) {
  // Bounded identically to the web action — see lib/reminderWindow.ts. This is
  // the query the Android notification poller calls, so an unbounded version
  // here meant the phone got the exact backlog burst the web fix prevented.
  return prisma.reminder.findMany({
    where: dueReminderWhere(userId),
    orderBy: { triggerAt: "asc" },
    include: { task: { select: { id: true, title: true } } },
    take: DUE_REMINDER_TAKE,
  })
}

export async function markRemindersDispatched(userId: string, input: unknown) {
  // A malformed payload is a client bug, not an empty request: silently
  // answering `{ success: true, count: 0 }` told the caller dispatch had worked
  // while the reminders stayed undispatched and re-fired on every poll.
  const parsed = z.object({ ids: z.array(z.string()).default([]) }).safeParse(input)
  if (!parsed.success) throw badRequest("Invalid input", parsed.error.errors)
  const ids = parsed.data.ids
  if (ids.length === 0) return { success: true, count: 0 }

  const res = await prisma.reminder.updateMany({
    where: { id: { in: ids.slice(0, 500) }, userId },
    data: { dispatchedAt: new Date() },
  })
  return { success: true, count: res.count }
}
