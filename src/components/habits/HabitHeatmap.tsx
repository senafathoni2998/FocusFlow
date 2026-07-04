"use client"

import type { Habit } from "@/types/habit"
import { amountsByDay, localDayKey, isSatisfied } from "@/lib/habitStats"

const FULL: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}
const PARTIAL: Record<string, string> = {
  primary: "bg-primary-200",
  success: "bg-success-200",
  warning: "bg-warning-200",
  danger: "bg-danger-200",
}

// Construct a local-midnight day n days from d (DST-safe — no fixed-ms arithmetic).
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

interface HabitHeatmapProps {
  habit: Habit
  weeks?: number
  now?: Date
}

/**
 * GitHub-style check-in grid: `weeks` columns (Sun–Sat), colored by whether the
 * day's check-in met the goal. Date-relative, so only render client-side (it
 * lives in the detail modal, which is never SSR'd).
 */
export default function HabitHeatmap({ habit, weeks = 16, now = new Date() }: HabitHeatmapProps) {
  const amounts = amountsByDay(habit.checkIns)
  const full = FULL[habit.color] ?? FULL.primary
  const partial = PARTIAL[habit.color] ?? PARTIAL.primary
  const isAmount = habit.goalType === "amount"

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const gridStart = addDays(today, -((weeks - 1) * 7 + today.getDay())) // Sunday of the earliest week

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(gridStart, w * 7 + d)
      const key = localDayKey(day)
      const future = day.getTime() > today.getTime()
      const amt = future ? 0 : amounts.get(key) ?? 0
      let cls = "bg-gray-100"
      if (future) cls = "bg-transparent"
      else if (isSatisfied(habit, amt)) cls = full
      else if (isAmount && amt > 0) cls = partial
      return { key, cls, title: future ? key : `${key} · ${amt}` }
    })
  )

  return (
    <div className="flex gap-1 overflow-x-auto" role="img" aria-label={`${habit.name} check-in history`}>
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col gap-1">
          {col.map((cell) => (
            <div key={cell.key} title={cell.title} className={`w-3 h-3 rounded-sm ${cell.cls}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
