"use client"

import { useState } from "react"

interface ReviewData {
  weekStart: string
  weekEnd: string
  stats: { tasksCompleted: number; focusMinutes: number; habitCheckins: number }
  recap: string[]
  plan: string[]
  error?: string
}

function humanFocus(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function WeeklyReview() {
  const [review, setReview] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const generate = async () => {
    if (loading) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/ai/weekly-review")
      if (!res.ok) throw new Error("request failed")
      const data: ReviewData = await res.json()
      setReview(data)
      // A soft error (e.g. no provider) still ships usable fallback content.
      setError(data.error || "")
    } catch {
      setError("Couldn't generate the review. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗓️</span>
          <h3 className="text-lg font-semibold text-gray-900">Weekly Review</h3>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="text-primary-600 hover:text-primary-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? "Generating…" : review ? "Regenerate" : "Generate"}
        </button>
      </div>

      {/* Announce progress/completion to assistive tech (the skeleton is hidden). */}
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? "Generating your weekly review…" : review ? "Weekly review ready." : ""}
      </span>

      {error && (
        <div className="bg-warning-50 border border-warning-200 text-warning-800 px-4 py-3 rounded-lg mb-4 text-sm" role="status">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-gray-200 rounded w-full animate-pulse" />
          ))}
        </div>
      ) : review ? (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {fmt(review.weekStart)} – {fmt(review.weekEnd)} · last 7 days
          </p>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-sm text-primary-700">
              ✅ {review.stats.tasksCompleted} completed
            </span>
            <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-sm text-primary-700">
              ⏱ {humanFocus(review.stats.focusMinutes)} focus
            </span>
            <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-sm text-primary-700">
              🔁 {review.stats.habitCheckins} check-ins
            </span>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">This week</h4>
            <ul className="space-y-2">
              {review.recap.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-primary-600 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Plan for next week</h4>
            <ul className="space-y-2">
              {review.plan.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-success-600 mt-0.5">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">
          Generate an AI recap of what you got done over the last 7 days, plus a plan for the week ahead.
        </p>
      )}
    </div>
  )
}
