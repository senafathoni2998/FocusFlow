"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

// These are "use server" exports, i.e. publicly callable endpoints — the caller's
// arguments are untrusted even when the only in-app caller passes fixed values.
// Kept in step with `startSchema` in src/lib/services/sessionService.ts.
const SESSION_TYPES = ["pomodoro", "short-break", "long-break"] as const
const MAX_DURATION_SEC = 24 * 60 * 60

export async function startSession(taskId: string | null, type: string, duration: number) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  if (!SESSION_TYPES.includes(type as (typeof SESSION_TYPES)[number])) {
    return { error: "Invalid session type" }
  }
  if (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_SEC) {
    return { error: "Invalid duration" }
  }

  try {
    // If a task was named, ensure the caller owns it — otherwise a focus session
    // could be attached to another user's task.
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId: session.user.id },
        select: { id: true },
      })
      if (!task) {
        return { error: "Task not found" }
      }
    }

    const focusSession = await prisma.focusSession.create({
      data: {
        type,
        duration,
        status: "running",
        startTime: new Date(),
        userId: session.user.id,
        taskId
      }
    })

    revalidatePath("/dashboard")
    return { success: true, session: focusSession }
  } catch (error) {
    return { error: "Failed to start session" }
  }
}

export async function completeSession(sessionId: string) {
  const authSession = await auth()

  if (!authSession?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify session ownership
    const existingSession = await prisma.focusSession.findFirst({
      where: { id: sessionId, userId: authSession.user.id }
    })

    if (!existingSession) {
      return { error: "Session not found" }
    }

    const updatedSession = await prisma.focusSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        // Stamped server-side. A client-supplied endTime let focus minutes — which
        // feed the dashboard, weekly review and each task's actualMin — be forged.
        endTime: new Date()
      }
    })

    revalidatePath("/dashboard")
    return { success: true, session: updatedSession }
  } catch (error) {
    return { error: "Failed to complete session" }
  }
}

export async function cancelSession(sessionId: string) {
  const authSession = await auth()

  if (!authSession?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify session ownership
    const existingSession = await prisma.focusSession.findFirst({
      where: { id: sessionId, userId: authSession.user.id }
    })

    if (!existingSession) {
      return { error: "Session not found" }
    }

    await prisma.focusSession.update({
      where: { id: sessionId },
      data: {
        status: "cancelled",
        endTime: new Date()
      }
    })

    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    return { error: "Failed to cancel session" }
  }
}

export async function getUserSessions(days: number = 30) {
  const session = await auth()

  if (!session?.user?.id) {
    return []
  }

  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const sessions = await prisma.focusSession.findMany({
      where: {
        userId: session.user.id,
        startTime: { gte: startDate }
      },
      include: {
        task: {
          select: { title: true }
        }
      },
      orderBy: { startTime: "desc" }
    })

    return sessions
  } catch (error) {
    return []
  }
}
