"use client"

import { useEffect, useState } from "react"
import type { Goal } from "@/types/goal"
import { computeGoalProgress } from "@/lib/goalStats"

const FILL: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

const formatNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))

interface GoalCardProps {
  goal: Goal
  onAdjust: (delta: number) => void
  onSetStatus: (status: string) => void
  onEdit: () => void
  onDelete: () => void
  busy?: boolean
}

export default function GoalCard({ goal, onAdjust, onSetStatus, onEdit, onDelete, busy }: GoalCardProps) {
  // The deadline countdown depends on the local clock, which the server (UTC)
  // can't know — render it only after mount so SSR and hydration agree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const progress = computeGoalProgress(goal)
  const isNumeric = goal.progressType === "numeric"
  const isTasks = goal.progressType === "tasks"
  const isAchieved = goal.status === "achieved"
  const fill = FILL[goal.color] ?? FILL.primary
  const step = isNumeric ? 1 : 10

  const metaLabel = isTasks
    ? `${goal.taskCompleted ?? 0}/${goal.taskTotal ?? 0} tasks`
    : isNumeric
      ? `${formatNum(goal.currentValue)}/${formatNum(goal.targetValue ?? 0)} ${goal.unit ?? ""}`
      : `${progress.percent}%`

  const deadline = () => {
    if (progress.daysRemaining === null || isAchieved || progress.isAchieved) return null
    const d = progress.daysRemaining
    if (d === 0) return <span className="text-warning-600">Due today</span>
    if (d < 0) return <span className="text-danger-600">Overdue {-d}d</span>
    return <span className={d <= 7 ? "text-warning-600" : "text-gray-400"}>{d}d left</span>
  }

  return (
    <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition">
      <span className="text-2xl" aria-hidden="true">
        {goal.icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{goal.title}</span>
          {isAchieved && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-success-50 text-success-700 whitespace-nowrap">
              ✓ Achieved
            </span>
          )}
        </div>
        {goal.description && <div className="text-xs text-gray-500 truncate">{goal.description}</div>}

        <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div className={`h-full rounded-full ${fill}`} style={{ width: `${progress.percent}%` }} />
        </div>

        <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="tabular-nums">{metaLabel}</span>
          {mounted && deadline()}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!isTasks && (
          <>
            <button
              type="button"
              onClick={() => onAdjust(-step)}
              disabled={busy}
              aria-label="Decrease progress"
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 leading-none"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onAdjust(step)}
              disabled={busy}
              aria-label="Increase progress"
              className={`w-8 h-8 rounded-full text-white leading-none ${fill} disabled:opacity-50`}
            >
              +
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onSetStatus(isAchieved ? "active" : "achieved")}
          disabled={busy}
          aria-label={isAchieved ? "Reactivate" : "Mark achieved"}
          aria-pressed={isAchieved}
          className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition disabled:opacity-50 ${
            isAchieved ? `${fill} border-transparent text-white` : "border-gray-300 text-transparent hover:border-gray-400"
          }`}
        >
          ✓
        </button>
      </div>

      <div className="flex gap-2 text-sm">
        <button type="button" onClick={onEdit} className="text-primary-600 hover:text-primary-800">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="text-danger-600 hover:text-danger-800">
          Delete
        </button>
      </div>
    </div>
  )
}
