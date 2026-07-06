"use client"

import { useMemo } from "react"
import type { Task } from "@/types/task"
import { isTerminalStatus } from "@/lib/taskConstants"
import TaskCard from "./TaskCard"

interface TaskMatrixViewProps {
  tasks: Task[]
  /** Client-side "now"; null until mounted (urgency is relative to today). */
  now: Date | null
  onUpdate?: () => void
  subtasksByParent?: Record<string, Task[]>
}

/** A task is "urgent" if it's due within this many days (or overdue). */
const URGENT_WITHIN_DAYS = 2

type QuadKey = "doFirst" | "schedule" | "delegate" | "later"

const QUADRANTS: {
  key: QuadKey
  title: string
  subtitle: string
  accent: string
  badge: string
}[] = [
  { key: "doFirst", title: "Do first", subtitle: "Urgent & important", accent: "border-t-danger-400", badge: "bg-danger-100 text-danger-800" },
  { key: "schedule", title: "Schedule", subtitle: "Important, not urgent", accent: "border-t-primary-400", badge: "bg-primary-100 text-primary-800" },
  { key: "delegate", title: "Delegate", subtitle: "Urgent, not important", accent: "border-t-warning-400", badge: "bg-warning-100 text-warning-800" },
  { key: "later", title: "Later", subtitle: "Neither", accent: "border-t-gray-300", badge: "bg-gray-100 text-gray-700" },
]

/** Whole days from `now`'s local day to `due`'s local day (negative = overdue). */
function daysUntil(due: Date, now: Date): number {
  const d = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((d - t) / 86_400_000)
}

/**
 * Eisenhower matrix: sorts actionable (non-terminal) tasks into four quadrants by
 * urgency (due soon / overdue) × importance (high priority). Reuses TaskCard so
 * every task keeps its full interactions. Urgency is relative to today, so it
 * renders a skeleton until `now` is set (no hydration mismatch).
 */
export default function TaskMatrixView({ tasks, now, onUpdate, subtasksByParent }: TaskMatrixViewProps) {
  const groups = useMemo(() => {
    const g: Record<QuadKey, Task[]> = { doFirst: [], schedule: [], delegate: [], later: [] }
    if (!now) return g
    for (const t of tasks) {
      if (isTerminalStatus(t.status)) continue // the matrix is about what to do
      const important = t.priority === "high"
      const urgent = t.dueDate != null && daysUntil(new Date(t.dueDate), now) <= URGENT_WITHIN_DAYS
      if (urgent && important) g.doFirst.push(t)
      else if (important) g.schedule.push(t)
      else if (urgent) g.delegate.push(t)
      else g.later.push(t)
    }
    return g
  }, [tasks, now])

  if (!now) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUADRANTS.map((q) => (
          <div key={q.key} className="h-64 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {QUADRANTS.map((q) => {
        const quadTasks = groups[q.key]
        return (
          <section
            key={q.key}
            className={`rounded-xl border border-gray-200 border-t-4 ${q.accent} bg-white p-4`}
          >
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-gray-900">{q.title}</h2>
              <span className="text-xs text-gray-400">{q.subtitle}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full tabular-nums ${q.badge}`}>
                {quadTasks.length}
              </span>
            </div>
            {quadTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nothing here.</p>
            ) : (
              <div className="space-y-3">
                {quadTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    subtasks={subtasksByParent?.[t.id]}
                    onUpdate={onUpdate}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
