import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get("days") || "30")

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Fetch sessions with task info
    const sessions = await prisma.focusSession.findMany({
      where: {
        userId: session.user.id,
        startTime: { gte: startDate }
      },
      include: {
        task: {
          select: { title: true, status: true, priority: true }
        }
      },
      orderBy: { startTime: "desc" }
    })

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id }
    })

    // Calculate daily focus time
    const dailyFocusTime: Record<string, number> = {}
    const sessionsPerDay: Record<string, number> = {}

    sessions.forEach((session) => {
      const dateKey = session.startTime.toISOString().split("T")[0]
      const duration = session.endTime
        ? Math.floor((new Date(session.endTime).getTime() - session.startTime.getTime()) / 1000 / 60)
        : 0

      dailyFocusTime[dateKey] = (dailyFocusTime[dateKey] || 0) + duration
      sessionsPerDay[dateKey] = (sessionsPerDay[dateKey] || 0) + 1
    })

    // Convert to arrays
    const dailyData = Object.entries(dailyFocusTime).map(([date, minutes]) => ({
      date,
      minutes,
      sessions: sessionsPerDay[date] || 0
    }))

    // Task distribution
    const taskStats = {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      inProgress: tasks.filter((t) => t.status === "in-progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      highPriority: tasks.filter((t) => t.priority === "high").length,
      mediumPriority: tasks.filter((t) => t.priority === "medium").length,
      lowPriority: tasks.filter((t) => t.priority === "low").length
    }

    // Session stats
    const sessionStats = {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      cancelled: sessions.filter((s) => s.status === "cancelled").length,
      totalMinutes: sessions.reduce((acc, s) => {
        if (s.endTime) {
          return acc + Math.floor((new Date(s.endTime).getTime() - s.startTime.getTime()) / 1000 / 60)
        }
        return acc
      }, 0)
    }

    // Peak productivity hours
    const hourlyData: Record<number, number> = {}
    sessions.forEach((session) => {
      if (session.status === "completed") {
        const hour = session.startTime.getHours()
        hourlyData[hour] = (hourlyData[hour] || 0) + 1
      }
    })

    const peakHours = Object.entries(hourlyData)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return NextResponse.json({
      dailyData,
      taskStats,
      sessionStats,
      peakHours
    })
  } catch (error) {
    console.error("Analytics error:", error)
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
