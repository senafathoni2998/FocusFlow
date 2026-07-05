"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { Habit } from "@/types/habit"
import { computeHabitStats } from "@/lib/habitStats"

/**
 * Compact dashboard widget: active habits with today's status + streak. Streak
 * and today-done depend on the local clock, so they render only after mount
 * (like HabitRow) to keep SSR and hydration in agreement.
 */
export default function HabitsWidget({ habits }: { habits: Habit[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const active = habits.slice(0, 5)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span aria-hidden="true">🔁</span> Habits
        </h3>
        <Link href="/habits" className="text-sm text-primary-600 hover:text-primary-800">
          View all →
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-gray-500">
          No habits yet.{" "}
          <Link href="/habits" className="text-primary-600 hover:underline">
            Start one →
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {active.map((h) => {
            const stats = mounted ? computeHabitStats(h) : null
            return (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true">{h.icon}</span>
                <span className="flex-1 truncate text-gray-700">{h.name}</span>
                <span className="text-gray-400 tabular-nums">
                  🔥 {stats ? stats.currentStreak : 0}
                  {h.frequencyType === "weekly" ? "w" : "d"}
                </span>
                <span aria-hidden="true" className={stats?.todayDone ? "text-success-600" : "text-gray-300"}>
                  {stats?.todayDone ? "✓" : "○"}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
