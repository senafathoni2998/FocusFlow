"use client"

import { useEffect, useState } from "react"
import { computeFocusStats } from "@/lib/focusStats"

interface FocusStreakProps {
  /** Completed-pomodoro start times (ISO). If omitted, the component fetches
   *  them from /api/analytics itself (used on the timer page). */
  starts?: string[]
  variant?: "card" | "compact"
}

export default function FocusStreak({ starts, variant = "card" }: FocusStreakProps) {
  // The streak buckets by LOCAL day, so it must be computed after mount — the
  // server render would use a different timezone and mismatch on hydration.
  const [mounted, setMounted] = useState(false)
  // An empty `starts` may be a genuinely empty history OR a failed SSR analytics
  // fetch (which passes []), so treat only a NON-empty prop as authoritative and
  // otherwise self-fetch — that recovers a real streak after a transient failure.
  const hasStarts = !!starts && starts.length > 0
  const [data, setData] = useState<string[] | null>(hasStarts ? starts! : null)

  useEffect(() => {
    setMounted(true)
    if (hasStarts) return
    let cancelled = false
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && Array.isArray(j.focusSessionStarts)) setData(j.focusSessionStarts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasStarts])

  const stats = mounted && data ? computeFocusStats(data) : null
  const current = stats?.currentStreak ?? 0
  const best = stats?.bestStreak ?? 0
  const today = stats?.todayCount ?? 0

  if (variant === "compact") {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-warning-700"
        aria-label={mounted ? `Focus streak: ${current} days` : undefined}
      >
        <span aria-hidden="true">🔥</span>
        <span suppressHydrationWarning>
          {mounted ? `${current}-day focus streak` : "…"}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border-2 border-warning-200 bg-warning-50 p-6 flex items-center gap-4">
      <span className="text-4xl" aria-hidden="true">
        🔥
      </span>
      <div>
        <div className="text-2xl font-bold text-gray-900" suppressHydrationWarning>
          {mounted ? `${current}-day focus streak` : "—"}
        </div>
        <div className="text-sm text-gray-600" suppressHydrationWarning>
          {mounted
            ? `Best: ${best} day${best === 1 ? "" : "s"} · ${today} pomodoro${today === 1 ? "" : "s"} today`
            : " "}
        </div>
      </div>
    </div>
  )
}
