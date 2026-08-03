import type { Prisma } from "@prisma/client"

/**
 * The one definition of "which reminders are due right now".
 *
 * This lived in two places — the web Server Action and the mobile service — and
 * they drifted: the web query was bounded after a burst of backlogged reminders
 * produced a wall of banners clipped off the top of the viewport, but the mobile
 * service kept the original unbounded form. That is the query the Android
 * notification poller calls, so the phone would have received the very burst the
 * web fix was written to prevent.
 *
 * Both bounds matter and for different reasons:
 *   - `take` caps a single poll, so a backlog arrives as a handful rather than a
 *     screenful of simultaneous notifications.
 *   - the staleness floor drops reminders that fired long ago. A reminder two
 *     weeks late is not a reminder; delivering it is noise, and it stays
 *     undispatched rather than arriving wrong.
 */
export const DUE_REMINDER_TAKE = 5
export const DUE_REMINDER_STALE_MS = 24 * 60 * 60 * 1000

export function dueReminderWhere(
  userId: string,
  now: Date = new Date(),
): Prisma.ReminderWhereInput {
  return {
    userId,
    dispatchedAt: null,
    triggerAt: { lte: now, gte: new Date(now.getTime() - DUE_REMINDER_STALE_MS) },
  }
}
