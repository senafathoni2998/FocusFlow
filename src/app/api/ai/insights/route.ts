import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateInsights } from "@/lib/openai"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Fetch recent sessions, tasks, active goals, and habits (with recent
    // check-ins) so the coach can reason across all pillars.
    const [sessions, tasks, goals, habits] = await Promise.all([
      prisma.focusSession.findMany({
        where: { userId: session.user.id },
        orderBy: { startTime: "desc" },
        take: 50
      }),
      prisma.task.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.goal.findMany({
        where: { userId: session.user.id, status: { not: "archived" } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.habit.findMany({
        where: { userId: session.user.id, archived: false },
        // Match getHabits' window (habits.ts): computeHabitStats walks back up to
        // 366*3 days for the current streak, so a shorter cap would undercount it.
        include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } }
      })
    ])

    const result = await generateInsights(sessions, tasks, goals, habits)

    return NextResponse.json(result)
  } catch (error) {
    console.error("AI insights error:", error)
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    )
  }
}
