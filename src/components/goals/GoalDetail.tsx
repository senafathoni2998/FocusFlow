"use client"

import { useEffect, useState } from "react"
import type { Goal, GoalTask } from "@/types/goal"
import { getGoalTasks } from "@/app/actions/goals"
import { completeTask, updateTask } from "@/app/actions/tasks"
import { goalPercent } from "@/lib/goalStats"

const FILL: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

// dueDate is stored at LOCAL midnight (parseDateInput), so format with local getters.
const toYMD = (d?: Date | string | null): string => {
  if (!d) return ""
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

interface GoalDetailProps {
  goal: Goal
  onClose: () => void
  onChanged: () => void
}

export default function GoalDetail({ goal, onClose, onChanged }: GoalDetailProps) {
  const [tasks, setTasks] = useState<GoalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getGoalTasks(goal.id).then((t) => {
      if (!cancelled) {
        setTasks(t as GoalTask[])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [goal.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const percent = goalPercent(goal)
  const fill = FILL[goal.color] ?? FILL.primary

  const toggle = async (t: GoalTask) => {
    setBusyId(t.id)
    // Complete via completeTask (rolls a recurring task forward); reopen via updateTask.
    if (t.status === "completed") await updateTask(t.id, { status: "todo" })
    else await completeTask(t.id)
    const fresh = await getGoalTasks(goal.id)
    setTasks(fresh as GoalTask[])
    setBusyId(null)
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">
            {goal.icon}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 break-words">{goal.title}</h2>
            {goal.description && <p className="text-sm text-gray-500 mt-0.5">{goal.description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1 text-xs text-gray-500 tabular-nums">{percent}%</div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Linked tasks</h3>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-400">
              No tasks linked yet. Assign a task to this goal from the task&apos;s Goal field.
            </p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.status === "completed"}
                    // Disable every row while any toggle is in flight, so overlapping
                    // completions can't refetch out of order and desync the list.
                    disabled={busyId !== null}
                    onChange={() => toggle(t)}
                    aria-label={`Complete ${t.title}`}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span
                    className={`flex-1 text-sm ${t.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}
                  >
                    {t.title}
                  </span>
                  {t.dueDate && <span className="text-xs text-gray-400 tabular-nums">{toYMD(t.dueDate)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
