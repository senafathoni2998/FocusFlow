"use client"

import { useEffect } from "react"
import type { Habit } from "@/types/habit"
import { computeHabitStats } from "@/lib/habitStats"
import HabitHeatmap from "./HabitHeatmap"

interface HabitDetailProps {
  habit: Habit
  onClose: () => void
}

/** Stats + check-in heatmap for a habit. Click-only (never SSR), so its
 *  date-relative stats/heatmap don't risk a hydration mismatch. */
export default function HabitDetail({ habit, onClose }: HabitDetailProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // One shared "now" so the stat tiles and the heatmap can't disagree about
  // which day is today if a render straddles local midnight.
  const now = new Date()
  const stats = computeHabitStats(habit, now)
  const target = habit.targetAmount ?? 1

  const statItems = [
    { label: "Streak", value: `🔥 ${stats.currentStreak}` },
    { label: "Best", value: `${stats.bestStreak}d` },
    { label: "Total", value: `${stats.totalDays}` },
    { label: "This month", value: `${stats.monthlyRate}%` },
  ]

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">
            {habit.icon}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 break-words">{habit.name}</h2>
            <p className="text-sm text-gray-500">
              {habit.goalType === "amount"
                ? `Reach ${target}${habit.unit ? ` ${habit.unit}` : ""} a day`
                : "Mark done each day"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {statItems.map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-gray-900 tabular-nums">{s.value}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Last 16 weeks</h3>
          <HabitHeatmap habit={habit} now={now} />
        </div>
      </div>
    </div>
  )
}
