import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ApiError, notFound } from "@/lib/apiResponse"
import { cappedEndTime } from "@/lib/sessionTiming"

/**
 * Focus (pomodoro) sessions for the mobile API — mirrors `src/app/actions/sessions.ts`.
 * Enables a mobile focus timer and feeds each task's derived `actualMin`.
 */

const startSchema = z.object({
  taskId: z.string().nullable().optional(),
  type: z.enum(["pomodoro", "short-break", "long-break"]).default("pomodoro"),
  duration: z.number().int().positive().max(24 * 60 * 60),
  /**
   * When the session actually began, for a client replaying one it recorded
   * offline. Omit it and the server stamps now, exactly as before.
   *
   * The server used to stamp unconditionally, which made focus sessions
   * unqueueable: a flight's pomodoros all landed at the instant the wifi
   * reconnected, putting hours of focus time on the wrong DAY in every
   * analytics chart, because actualMin and "Focus (7d)" are both derived from
   * these rows.
   */
  startTime: z.string().datetime().optional(),
})

/** How far back a client may claim a session started. */
const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000

export async function startSession(userId: string, input: unknown) {
  const v = startSchema.parse(input)
  // If a task was named, ensure the caller owns it (avoid attaching to a foreign task).
  if (v.taskId) {
    const task = await prisma.task.findFirst({ where: { id: v.taskId, userId }, select: { id: true } })
    if (!task) throw notFound("Task not found")
  }
  // Close out the caller's OWN sessions whose planned end has already passed.
  // Nothing reaps them otherwise, so a flaky client that retries a start leaves
  // "running" rows that are never completed or cancelled and quietly inflate the
  // session counts and the AI-insights payload.
  //
  // Bounded by startTime + duration rather than sweeping every running row: a
  // session still inside its own window may be genuinely running on another
  // device, and cancelling that would be worse than the leak. One past its
  // planned end can never become a valid completion anyway — cappedEndTime would
  // clamp it to exactly this instant.
  await reapExpiredRunning(userId)

  return prisma.focusSession.create({
    data: {
      type: v.type,
      duration: v.duration,
      status: "running",
      startTime: clampedStart(v.startTime),
      userId,
      taskId: v.taskId ?? null,
    },
  })
}

/**
 * Accept a client's start instant, bounded at both ends.
 *
 * Clamped FORWARD to now, because a session cannot have started in the future
 * and a device with a fast clock would otherwise book focus time into tomorrow.
 * Clamped BACKWARD to 30 days, which is comfortably past the client queue's own
 * 14-day expiry — anything older is not a replayed session, and letting it
 * through would rewrite historical stats for any day the caller chose.
 */
function clampedStart(raw: string | undefined): Date {
  const now = new Date()
  if (!raw) return now
  const t = new Date(raw)
  if (isNaN(t.getTime())) return now
  if (t.getTime() > now.getTime()) return now
  if (now.getTime() - t.getTime() > MAX_BACKDATE_MS) {
    return new Date(now.getTime() - MAX_BACKDATE_MS)
  }
  return t
}

/**
 * Cancel this user's running sessions that are already past `startTime + duration`.
 * Uses a raw comparison because Prisma cannot filter one column against another.
 */
async function reapExpiredRunning(userId: string) {
  const stale = await prisma.focusSession.findMany({
    where: { userId, status: "running" },
    select: { id: true, startTime: true, duration: true },
  })
  const now = Date.now()
  const expired = stale
    .filter((s) => new Date(s.startTime).getTime() + s.duration * 1000 <= now)
    .map((s) => s.id)
  if (expired.length === 0) return

  await prisma.focusSession.updateMany({
    where: { id: { in: expired }, userId, status: "running" },
    data: { status: "cancelled", endTime: new Date() },
  })
}

export async function completeSession(userId: string, id: string) {
  const existing = await prisma.focusSession.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Session not found")
  // Only a RUNNING session can be completed. Without this, completing an already
  // cancelled session flipped it to "completed" and stamped an endTime — and
  // focus metrics filter on status "completed", so a session the user explicitly
  // abandoned started counting as focus time. Re-completing a finished one also
  // re-derived its endTime on every call.
  if (existing.status !== "running") {
    throw new ApiError(409, "Session is not running")
  }
  return prisma.focusSession.update({
    where: { id },
    // Capped at the planned duration — see cappedEndTime. A phone that sleeps mid
    // timer would otherwise persist a multi-hour "pomodoro" into every focus metric.
    data: {
      status: "completed",
      endTime: cappedEndTime(existing.startTime, existing.duration),
    },
  })
}

export async function cancelSession(userId: string, id: string) {
  const existing = await prisma.focusSession.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Session not found")
  // Symmetrical with completeSession: cancelling a finished session would
  // otherwise rewrite a completed row's status and endTime.
  if (existing.status !== "running") {
    throw new ApiError(409, "Session is not running")
  }
  await prisma.focusSession.update({
    where: { id },
    // Same clamp as completeSession. A device that sleeps mid-timer and cancels
    // on wake would otherwise persist a multi-hour span for a 25-minute session.
    // Cancelled rows are excluded from focus metrics today, so nothing is
    // currently wrong downstream — but storing a duration that never happened
    // is a trap for the first query that stops filtering on status.
    data: { status: "cancelled", endTime: cappedEndTime(existing.startTime, existing.duration) },
  })
  return { success: true }
}

/** Upper bound on the history window, so no caller can ask for an unbounded scan. */
export const MAX_SESSION_DAYS = 366

export async function getUserSessions(userId: string, days = 30) {
  // Clamped here as well as at the route, so the service is safe for any future
  // caller rather than trusting each one to validate.
  days = Number.isInteger(days) ? Math.min(Math.max(days, 1), MAX_SESSION_DAYS) : 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  return prisma.focusSession.findMany({
    where: { userId, startTime: { gte: startDate } },
    include: { task: { select: { title: true } } },
    orderBy: { startTime: "desc" },
  })
}
