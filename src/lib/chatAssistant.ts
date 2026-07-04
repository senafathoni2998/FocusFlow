import { getTasks } from "@/app/actions/tasks"
import { getGoals } from "@/app/actions/goals"
import { getHabits } from "@/app/actions/habits"
import { computeHabitStats } from "@/lib/habitStats"
import type { Habit } from "@/types/habit"

/**
 * Suggest quick actions based on the user's tasks, goals, and habits. Each source
 * is fetched defensively (falling back to an empty list) so one failing read can't
 * blank the whole suggestion strip. Task-derived chips come first (preserving the
 * original ordering), then a goal and a habit chip, capped at 3.
 */
export async function getSuggestedActions(): Promise<string[]> {
  const [tasksRaw, goalsRaw, habitsRaw] = await Promise.all([
    Promise.resolve(getTasks()).catch(() => []),
    Promise.resolve(getGoals()).catch(() => []),
    Promise.resolve(getHabits()).catch(() => []),
  ])

  const tasks = tasksRaw ?? []
  const goals = goalsRaw ?? []
  const habits = habitsRaw ?? []
  const suggestions: string[] = []

  const highPriorityTasks = tasks.filter(t => t.priority === "high" && t.status !== "completed")
  if (highPriorityTasks.length > 0) {
    suggestions.push("Show my high priority tasks")
  }

  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === "completed") return false
    return new Date(t.dueDate) < new Date()
  })
  if (overdueTasks.length > 0) {
    suggestions.push(`Show my ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`)
  }

  if (tasks.filter(t => t.status !== "completed").length > 5) {
    suggestions.push("Help me prioritize my tasks")
  }

  if (tasks.length === 0) {
    suggestions.push("Create my first task")
  }

  // Goal chip: only when there's an active goal to talk about.
  if (goals.some(g => g.status === "active")) {
    suggestions.push("Show my goals progress")
  }

  // Habit chip: only when a habit still needs today's check-in.
  if (habits.some(h => !computeHabitStats(h as Habit).todayDone)) {
    suggestions.push("Check in my habits")
  }

  if (suggestions.length === 0) {
    suggestions.push("Show all my tasks", "Create a new task")
  }

  return suggestions.slice(0, 3)
}
