"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export async function startSession(taskId: string | null, type: string, duration: number) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
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

export async function completeSession(sessionId: string, endTime: Date) {
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
        endTime
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
