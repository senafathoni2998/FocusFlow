import { prisma } from "@/lib/prisma"

/**
 * Lightweight dashboard summary for the mobile API. Composed server-side so the
 * home screen renders in one round-trip: task status counts, overdue/due-today,
 * completions, and focus minutes over a trailing window. Day boundaries use the
 * server's local time, matching how task dueDates are stored (local midnight).
 */

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export async function getDashboard(userId: string) {
  const now = new Date()
  const todayStart = startOfLocalDay(now)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const weekAgo = new Date(todayStart)
  weekAgo.setDate(weekAgo.getDate() - 7)

  // Only top-level tasks count toward the headline board numbers (subtasks roll up).
  const tasks = await prisma.task.findMany({
    where: { userId, parentTaskId: null },
    select: { status: true, dueDate: true, completedAt: true },
  })

  const byStatus = { todo: 0, "in-progress": 0, completed: 0, "wont-do": 0 } as Record<string, number>
  let overdue = 0
  let dueToday = 0
  let completedToday = 0
  let completedThisWeek = 0

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    const open = t.status === "todo" || t.status === "in-progress"
    if (t.dueDate) {
      const due = new Date(t.dueDate)
      if (open && due < todayStart) overdue++
      if (open && due >= todayStart && due < tomorrowStart) dueToday++
    }
    if (t.completedAt) {
      const c = new Date(t.completedAt)
      if (c >= todayStart && c < tomorrowStart) completedToday++
      if (c >= weekAgo) completedThisWeek++
    }
  }

  const sessions = await prisma.focusSession.findMany({
    where: { userId, status: "completed", type: "pomodoro", startTime: { gte: weekAgo } },
    select: { startTime: true, endTime: true },
  })
  let focusMinutesThisWeek = 0
  for (const s of sessions) {
    if (!s.endTime) continue
    const m = Math.floor((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
    if (m > 0) focusMinutesThisWeek += m
  }

  const [activeGoals, habitCount] = await Promise.all([
    prisma.goal.count({ where: { userId, status: "active" } }),
    prisma.habit.count({ where: { userId, archived: false } }),
  ])

  return {
    tasks: {
      total: tasks.length,
      byStatus,
      overdue,
      dueToday,
      completedToday,
      completedThisWeek,
    },
    focusMinutesThisWeek,
    activeGoals,
    habitCount,
  }
}
