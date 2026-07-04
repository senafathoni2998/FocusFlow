import type { Task } from "@/types/task"

/**
 * Subtask helpers. Subtasks are ordinary Tasks with `parentTaskId` set (the
 * self-relation added in Phase 1). Top-level views show only tasks with no
 * parent; a parent card surfaces its children's completion as a progress badge.
 */

export interface SubtaskProgress {
  done: number
  total: number
}

export function subtaskProgress(subtasks: Task[] | undefined): SubtaskProgress {
  if (!subtasks || subtasks.length === 0) return { done: 0, total: 0 }
  const done = subtasks.filter((s) => s.status === "completed").length
  return { done, total: subtasks.length }
}

/** Group all tasks by their parentTaskId; each parent's children are order-sorted. */
export function groupSubtasksByParent(tasks: Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {}
  for (const t of tasks) {
    if (t.parentTaskId) {
      ;(map[t.parentTaskId] ??= []).push(t)
    }
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return map
}

/** Tasks with no parent — the only ones shown as cards in the board/list views. */
export function topLevelTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.parentTaskId == null)
}
