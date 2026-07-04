"use client"

import { useEffect, useState } from "react"
import type { Habit } from "@/types/habit"
import { computeHabitStats } from "@/lib/habitStats"

const FILL: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

interface HabitRowProps {
  habit: Habit
  onCheckIn: (delta: number) => void
  onEdit: () => void
  onDelete: () => void
  busy?: boolean
}

export default function HabitRow({ habit, onCheckIn, onEdit, onDelete, busy }: HabitRowProps) {
  // "Today"-relative stats depend on the local clock, which the server (UTC)
  // can't know — compute them only after mount so SSR and hydration agree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const stats = computeHabitStats(habit)
  const isAmount = habit.goalType === "amount"
  const target = habit.targetAmount ?? 1
  const fill = FILL[habit.color] ?? FILL.primary

  const currentStreak = mounted ? stats.currentStreak : 0
  const todayAmount = mounted ? stats.todayAmount : 0
  const monthlyRate = mounted ? stats.monthlyRate : 0
  const todayDone = mounted && stats.todayDone

  return (
    <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition">
      <span className="text-2xl" aria-hidden="true">
        {habit.icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{habit.name}</div>
        <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="tabular-nums">🔥 {currentStreak}d</span>
          {isAmount && (
            <span className="tabular-nums">
              {todayAmount}/{target} {habit.unit ?? ""}
            </span>
          )}
          <span className="text-gray-400 tabular-nums">{monthlyRate}% this month</span>
        </div>
      </div>

      {isAmount ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCheckIn(-1)}
            disabled={busy || !mounted || todayAmount <= 0}
            aria-label="Decrease"
            className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 leading-none"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onCheckIn(1)}
            disabled={busy}
            aria-label="Increase"
            className={`w-8 h-8 rounded-full text-white leading-none ${fill} disabled:opacity-50`}
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCheckIn(todayDone ? -todayAmount || -1 : 1)}
          disabled={busy || !mounted}
          aria-label={todayDone ? "Undo today" : "Mark done today"}
          aria-pressed={todayDone}
          className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition disabled:opacity-50 ${
            todayDone
              ? `${fill} border-transparent text-white`
              : "border-gray-300 text-transparent hover:border-gray-400"
          }`}
        >
          ✓
        </button>
      )}

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
