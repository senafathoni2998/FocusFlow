import { getTasks } from "@/app/actions/tasks"

/**
 * Suggest quick actions based on user's tasks
 */
export async function getSuggestedActions(): Promise<string[]> {
  const tasks = await getTasks()
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

  if (suggestions.length === 0) {
    suggestions.push("Show all my tasks", "Create a new task")
  }

  return suggestions.slice(0, 3)
}
