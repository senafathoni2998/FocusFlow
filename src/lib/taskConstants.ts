/**
 * Single source of truth for Task status/priority value sets.
 *
 * Kept as string unions (not DB enums) to match the existing schema convention
 * and to keep the UI and Groq assistant sending plain string values.
 *
 * `priorityRank` is a denormalized integer sort key persisted on every Task
 * write, because Prisma cannot `orderBy` urgency over a string column.
 */

export const TASK_STATUSES = ["todo", "in-progress", "completed", "wont-do"] as const
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Terminal statuses that count as "done" and stamp `completedAt`. */
export const TERMINAL_STATUSES: TaskStatus[] = ["completed", "wont-do"]

export const DEFAULT_STATUS: TaskStatus = "todo"
export const DEFAULT_PRIORITY: TaskPriority = "medium"

/** none=0, low=1, medium=2, high=3 — higher rank = more urgent (sort desc). */
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/** Default rank matches the default priority ("medium"). */
export const DEFAULT_PRIORITY_RANK = PRIORITY_RANK[DEFAULT_PRIORITY]

/** Resolve a (possibly unknown) priority string to its sort rank. */
export function priorityRankOf(priority?: string | null): number {
  if (!priority) return DEFAULT_PRIORITY_RANK
  return PRIORITY_RANK[priority as TaskPriority] ?? DEFAULT_PRIORITY_RANK
}

export function isTerminalStatus(status?: string | null): boolean {
  return !!status && TERMINAL_STATUSES.includes(status as TaskStatus)
}

/** Human-friendly labels for UI selects/badges. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  completed: "Completed",
  "wont-do": "Won't Do",
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
}
