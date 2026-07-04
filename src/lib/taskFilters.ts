import type { Task } from "@/types/task"
import { isTerminalStatus, priorityRankOf } from "@/lib/taskConstants"
import {
  type DateHorizon,
  type CustomRange,
  HORIZON_ORDER,
  resolveHorizon,
  matchesHorizon,
} from "@/lib/dateHorizon"

/**
 * Composable task filtering + sorting over a horizon, status, priority, and
 * free-text query. This is the single place all views (board, list) narrow the
 * task set, so they stay consistent.
 */

export type SortKey = "manual" | "due" | "priority" | "title"

export interface TaskFilters {
  horizon: DateHorizon
  custom?: CustomRange
  /** Empty = all statuses. */
  statuses: string[]
  /** Empty = all priorities. */
  priorities: string[]
  query: string
  sort: SortKey
  /** undefined = all lists; null = Inbox (no list); string = that list. */
  listId?: string | null
}

export const DEFAULT_FILTERS: TaskFilters = {
  horizon: "all",
  statuses: [],
  priorities: [],
  query: "",
  sort: "manual",
}

/**
 * Smart-list horizon membership. Adds the two status-aware rules on top of the
 * pure date test:
 *  - "Overdue" excludes tasks already in a terminal state (completed / wont-do).
 *  - "Today" folds in still-open overdue tasks (TickTick's Today behaviour).
 */
export function matchesHorizonSmart(
  task: Task,
  horizon: DateHorizon,
  now: Date,
  custom?: CustomRange
): boolean {
  if (horizon === "overdue") {
    const range = resolveHorizon("overdue", now)
    return matchesHorizon(task.dueDate, range) && !isTerminalStatus(task.status)
  }

  if (horizon === "today") {
    const today = resolveHorizon("today", now)
    if (matchesHorizon(task.dueDate, today)) return true
    const overdue = resolveHorizon("overdue", now)
    return matchesHorizon(task.dueDate, overdue) && !isTerminalStatus(task.status)
  }

  return matchesHorizon(task.dueDate, resolveHorizon(horizon, now, custom))
}

function matchesQuery(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (task.title.toLowerCase().includes(q)) return true
  return (task.description ?? "").toLowerCase().includes(q)
}

export function matchesFilters(task: Task, filters: TaskFilters, now: Date = new Date()): boolean {
  if (filters.listId !== undefined) {
    if (filters.listId === null) {
      if (task.listId != null) return false // Inbox = tasks with no list
    } else if (task.listId !== filters.listId) {
      return false
    }
  }
  if (!matchesHorizonSmart(task, filters.horizon, now, filters.custom)) return false
  if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
  if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
  if (!matchesQuery(task, filters.query)) return false
  return true
}

const timeOf = (d: Date | string | null | undefined): number | null => {
  if (d == null) return null
  const t = new Date(d).getTime()
  return isNaN(t) ? null : t
}

/** Sort a copy of the tasks. Nulls (no due date, no order) sort last. */
export function applySort(tasks: Task[], sort: SortKey): Task[] {
  const sorted = [...tasks]
  switch (sort) {
    case "due":
      return sorted.sort((a, b) => {
        const ta = timeOf(a.dueDate)
        const tb = timeOf(b.dueDate)
        if (ta == null && tb == null) return 0
        if (ta == null) return 1
        if (tb == null) return -1
        return ta - tb
      })
    case "priority":
      return sorted.sort(
        (a, b) =>
          (b.priorityRank ?? priorityRankOf(b.priority)) -
          (a.priorityRank ?? priorityRankOf(a.priority))
      )
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    case "manual":
    default:
      return sorted.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  }
}

export function applyFilters(tasks: Task[], filters: TaskFilters, now: Date = new Date()): Task[] {
  return applySort(
    tasks.filter((t) => matchesFilters(t, filters, now)),
    filters.sort
  )
}

/**
 * Count of tasks matching each horizon's smart-list membership, for the sidebar
 * badges. Ignores the status/priority/query filters — a smart list's count
 * reflects everything in that date bucket.
 */
export function horizonCounts(tasks: Task[], now: Date = new Date()): Record<DateHorizon, number> {
  const counts = {} as Record<DateHorizon, number>
  for (const horizon of HORIZON_ORDER) {
    counts[horizon] = tasks.reduce(
      (n, task) => n + (matchesHorizonSmart(task, horizon, now) ? 1 : 0),
      0
    )
  }
  return counts
}

/** Distinct priorities present in the task set (for building the priority filter). */
export function distinctPriorities(tasks: Task[]): string[] {
  return Array.from(new Set(tasks.map((t) => t.priority)))
}
