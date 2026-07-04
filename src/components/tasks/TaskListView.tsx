"use client"

import { useMemo } from "react"
import TaskCard from "./TaskCard"
import { bucketByHorizon } from "@/lib/dateHorizon"
import type { Task } from "@/types/task"

interface TaskListViewProps {
  tasks: Task[]
  /** Client-side "now"; null until mounted (keeps SSR deterministic). */
  now: Date | null
  onUpdate?: () => void
  /** parentTaskId -> its subtasks, for the per-card progress badge / checklist. */
  subtasksByParent?: Record<string, Task[]>
}

/**
 * Linear list view grouped into time-section bands (Overdue → Today → …).
 * Before mount (`now === null`) it renders a flat list so server and client
 * markup agree; after mount it groups by due-date band.
 */
export default function TaskListView({ tasks, now, onUpdate, subtasksByParent }: TaskListViewProps) {
  const buckets = useMemo(
    () => (now ? bucketByHorizon(tasks, now) : null),
    [tasks, now]
  )

  if (tasks.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-12">
        No tasks match these filters.
      </p>
    )
  }

  if (!buckets) {
    return (
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} subtasks={subtasksByParent?.[task.id]} onUpdate={onUpdate} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {buckets.map((bucket) => (
        <section key={bucket.key}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {bucket.label}
            </h2>
            <span className="text-xs text-gray-400 tabular-nums">
              {bucket.tasks.length}
            </span>
            <div className="flex-1 border-t border-gray-100" />
          </div>
          <div className="space-y-3">
            {bucket.tasks.map((task) => (
              <TaskCard key={task.id} task={task} subtasks={subtasksByParent?.[task.id]} onUpdate={onUpdate} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
