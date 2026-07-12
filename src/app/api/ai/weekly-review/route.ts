import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateWeeklyReview } from "@/lib/weeklyReview"
import { startOfDay, endOfDay, subDays } from "date-fns"

// GET /api/ai/weekly-review — a rolling last-7-days review: deterministic stats +
// an AI recap of completed work + a next-week plan (with a no-AI fallback).
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const uid = session.user.id
    const now = new Date()
    const end = endOfDay(now)
    const start = startOfDay(subDays(now, 6)) // today + the 6 days before = 7 days

    // Habit check-ins are stored at UTC-midnight of the LOCAL calendar day, so we
    // must filter them by UTC calendar-day bounds (not the local-day instants used
    // for real-instant fields like completedAt/startTime) — otherwise the oldest
    // window day is dropped for users west of UTC. Mirrors habitStats/goalStats.
    const habitStart = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()))
    const habitEnd = new Date(
      Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
    )

    const [completedCount, completedTasks, pendingTasks, sessions, habits, goals, user] =
      await Promise.all([
        prisma.task.count({
          where: { userId: uid, status: "completed", completedAt: { gte: start, lte: end } },
        }),
        prisma.task.findMany({
          where: { userId: uid, status: "completed", completedAt: { gte: start, lte: end } },
          select: { title: true, priority: true, completedAt: true },
          orderBy: { completedAt: "desc" },
          take: 50,
        }),
      prisma.task.findMany({
        where: { userId: uid, status: { in: ["todo", "in-progress"] } },
        select: { title: true, priority: true },
        orderBy: { priorityRank: "desc" },
        take: 10,
      }),
      prisma.focusSession.findMany({
        where: { userId: uid, status: "completed", startTime: { gte: start, lte: end } },
        select: { startTime: true, endTime: true },
      }),
      prisma.habit.findMany({
        where: { userId: uid, archived: false },
        select: {
          name: true,
          checkIns: { where: { date: { gte: habitStart, lte: habitEnd } }, select: { id: true } },
        },
      }),
      prisma.goal.findMany({
        where: { userId: uid, status: "active" },
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.user.findUnique({ where: { id: uid }, select: { aiProvider: true } }),
    ])

    const result = await generateWeeklyReview(
      { completedTasks, completedCount, pendingTasks, sessions, habits, goals },
      user?.aiProvider ?? null,
    )

    return NextResponse.json({
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      ...result,
    })
  } catch (error) {
    console.error("Weekly review error:", error)
    return NextResponse.json({ error: "Failed to generate the weekly review" }, { status: 500 })
  }
}
