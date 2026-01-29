import { getTasks } from "@/app/actions/tasks"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: Date
}

export interface TaskOperation {
  type: "create" | "update" | "delete" | "list"
  data?: any
  result?: any
}

/**
 * Build context message with user's tasks
 */
export async function buildTaskContext() {
  const tasks = await getTasks()

  if (tasks.length === 0) {
    return "You have no tasks yet. I can help you create one!"
  }

  const byStatus = {
    todo: tasks.filter(t => t.status === "todo"),
    "in-progress": tasks.filter(t => t.status === "in-progress"),
    completed: tasks.filter(t => t.status === "completed")
  }

  let context = `You have ${tasks.length} task${tasks.length > 1 ? "s" : ""}:\n\n`

  if (byStatus.todo.length > 0) {
    context += `**To Do** (${byStatus.todo.length}):\n${byStatus.todo.map(t =>
      `• ${t.title}${t.priority !== "medium" ? ` [${t.priority}]` : ""}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}`
    ).join("\n")}\n\n`
  }

  if (byStatus["in-progress"].length > 0) {
    context += `**In Progress** (${byStatus["in-progress"].length}):\n${byStatus["in-progress"].map(t =>
      `• ${t.title}${t.priority !== "medium" ? ` [${t.priority}]` : ""}${t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleDateString()})` : ""}`
    ).join("\n")}\n\n`
  }

  if (byStatus.completed.length > 0) {
    context += `**Completed** (${byStatus.completed.length}):\n${byStatus.completed.slice(0, 5).map(t =>
      `• ${t.title}`
    ).join("\n")}${byStatus.completed.length > 5 ? `\n... and ${byStatus.completed.length - 5} more` : ""}\n\n`
  }

  return context
}

/**
 * Format task for display in chat
 */
export function formatTaskForChat(task: any): string {
  let formatted = `📌 **${task.title}**\n`
  formatted += `   Status: ${task.status} | Priority: ${task.priority}`

  if (task.description) {
    formatted += `\n   ${task.description}`
  }

  if (task.dueDate) {
    formatted += `\n   Due: ${new Date(task.dueDate).toLocaleDateString()}`
  }

  return formatted
}

/**
 * Format task list for display
 */
export function formatTaskList(tasks: any[]): string {
  if (tasks.length === 0) {
    return "No tasks found."
  }

  let formatted = `Found ${tasks.length} task${tasks.length > 1 ? "s" : ""}:\n\n`

  for (const task of tasks) {
    const icon = task.status === "completed" ? "✅" : task.status === "in-progress" ? "🔄" : "📋"
    const priorityIcon = task.priority === "high" ? "🔴" : task.priority === "low" ? "🟢" : "🟡"

    formatted += `${icon} ${priorityIcon} **${task.title}**\n`
    formatted += `   Status: ${task.status} | Priority: ${task.priority}\n`

    if (task.description) {
      formatted += `   ${task.description}\n`
    }

    if (task.dueDate) {
      const dueDate = new Date(task.dueDate)
      const isOverdue = dueDate < new Date() && task.status !== "completed"
      formatted += `   Due: ${dueDate.toLocaleDateString()}${isOverdue ? " ⚠️ OVERDUE" : ""}\n`
    }

    formatted += `\n`
  }

  return formatted.trim()
}

/**
 * Parse natural language date expressions
 */
export function parseNaturalDate(dateStr: string): Date | null {
  const lower = dateStr.toLowerCase().trim()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Today
  if (lower === "today" || lower === "tomorrow") {
    const date = new Date(today)
    if (lower === "tomorrow") {
      date.setDate(date.getDate() + 1)
    }
    return date
  }

  // Day of week
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const dayIndex = days.findIndex(d => lower.includes(d))

  if (dayIndex !== -1) {
    const date = new Date(today)
    const currentDay = date.getDay()
    let daysUntil = dayIndex - currentDay

    if (daysUntil <= 0) {
      daysUntil += 7
    }

    date.setDate(date.getDate() + daysUntil)
    return date
  }

  // Next week patterns
  if (lower.startsWith("next ")) {
    const dayName = lower.slice(5)
    const dayIndex = days.findIndex(d => d === dayName)

    if (dayIndex !== -1) {
      const date = new Date(today)
      const currentDay = date.getDay()
      let daysUntil = dayIndex - currentDay

      if (daysUntil <= 0) {
        daysUntil += 7
      }

      daysUntil += 7 // Add another week for "next"
      date.setDate(date.getDate() + daysUntil)
      return date
    }
  }

  // Number patterns: "in 3 days", "in 1 week"
  const inDaysMatch = lower.match(/in (\d+) days?/)
  if (inDaysMatch) {
    const date = new Date(today)
    date.setDate(date.getDate() + parseInt(inDaysMatch[1], 10))
    return date
  }

  const inWeeksMatch = lower.match(/in (\d+) weeks?/)
  if (inWeeksMatch) {
    const date = new Date(today)
    date.setDate(date.getDate() + (parseInt(inWeeksMatch[1], 10) * 7))
    return date
  }

  // Try standard date parsing
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  return null
}

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

/**
 * Detect intent from user message (for quick actions)
 */
export function detectIntent(message: string): "create" | "list" | "update" | "delete" | "unknown" {
  const lower = message.toLowerCase()

  if (/^(create|add|new|make|start|set up)/.test(lower)) {
    return "create"
  }

  if (/^(show|list|get|what|view|display|my tasks)/.test(lower)) {
    return "list"
  }

  if (/^(update|change|modify|edit|mark|set|complete|finish|done)/.test(lower)) {
    return "update"
  }

  if (/^(delete|remove|clear|get rid of)/.test(lower)) {
    return "delete"
  }

  return "unknown"
}
