import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound } from "@/lib/apiResponse"

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
    data: { status: "completed", endTime: new Date() },
  })
}

export async function cancelSession(userId: string, id: string) {
  const existing = await prisma.focusSession.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Session not found")
  await prisma.focusSession.update({
    where: { id },
    data: { status: "cancelled", endTime: new Date() },
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
