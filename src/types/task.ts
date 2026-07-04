import type { TaskStatus, TaskPriority } from "@/lib/taskConstants"

export type { TaskStatus, TaskPriority }

/**
 * Canonical client-facing Task shape.
 *
 * `status`/`priority` are typed as `string` (not the unions) so this interface
 * stays assignable from Prisma's generated row type, which types those columns
 * as `string`. Use `TaskStatus`/`TaskPriority` from `@/lib/taskConstants` when
 * typing form state or narrowing.
 *
 * Fields beyond the original set are optional so existing callers/tasks that
 * predate the Phase 1 migration remain valid.
 */
export interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  dueDate?: Date | null
  order?: number | null
  // Phase 1 additions
  startDate?: Date | null
  isAllDay?: boolean
  completedAt?: Date | null
  timeEstimateMin?: number | null
  estimatedPomos?: number | null
  priorityRank?: number
  parentTaskId?: string | null
  listId?: string | null
}

/** Minimal list shape the client UI needs (sidebar, form dropdowns). */
export interface ListSummary {
  id: string
  name: string
  color?: string | null
}

/** Presentation view modes for the task workspace (used from Phase 2 onward). */
export type ViewMode = "board" | "list" | "calendar" | "matrix"

/** How the current view groups tasks. */
export type GroupBy = "status" | "priority" | "timeSection" | "none"
