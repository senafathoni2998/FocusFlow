import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound } from "@/lib/apiResponse"
import { cappedEndTime } from "@/lib/sessionTiming"

/**
 * Focus (pomodoro) sessions for the mobile API — mirrors `src/app/actions/sessions.ts`.
 * Enables a mobile focus timer and feeds each task's derived `actualMin`.
 */

const startSchema = z.object({
  taskId: z.string().nullable().optional(),
  type: z.enum(["pomodoro", "short-break", "long-break"]).default("pomodoro"),
  duration: z.number().int().positive().max(24 * 60 * 60),
})

export async function startSession(userId: string, input: unknown) {
  const v = startSchema.parse(input)
  // If a task was named, ensure the caller owns it (avoid attaching to a foreign task).
  if (v.taskId) {
    const task = await prisma.task.findFirst({ where: { id: v.taskId, userId }, select: { id: true } })
    if (!task) throw notFound("Task not found")
  }
  return prisma.focusSession.create({
    data: {
      type: v.type,
      duration: v.duration,
      status: "running",
      startTime: new Date(),
      userId,
      taskId: v.taskId ?? null,
    },
  })
}

export async function completeSession(userId: string, id: string) {
  const existing = await prisma.focusSession.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Session not found")
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

export async function getUserSessions(userId: string, days = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  return prisma.focusSession.findMany({
    where: { userId, startTime: { gte: startDate } },
    include: { task: { select: { title: true } } },
    orderBy: { startTime: "desc" },
  })
}
