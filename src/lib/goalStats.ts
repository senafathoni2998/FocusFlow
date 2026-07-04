import type { Goal } from "@/types/goal"

/**
 * Pure goal progress: a 0-100 percent (manual or numeric), an achieved flag, and
 * a timezone-safe day countdown to the target date.
 *
 * Timezone note: `targetDate` is a calendar-day deadline stored at UTC midnight.
 * We key it by its UTC calendar day and compare against the LOCAL calendar day of
 * "now", both reduced to a whole day-count, so the countdown never drifts by a
 * day across timezones (the same approach habitStats uses for check-ins).
 */

export interface GoalProgress {
  percent: number // 0-100
  isAchieved: boolean
  daysRemaining: number | null // null when no target date
  isOverdue: boolean
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function goalPercent(goal: Goal): number {
  if (goal.progressType === "numeric") {
    const target = goal.targetValue ?? 0
    if (target <= 0) return 0
    return clampPct(((goal.currentValue ?? 0) / target) * 100)
  }
  return clampPct(goal.manualProgress ?? 0)
}

/** Whole days from `now`'s local day to `target`'s UTC calendar day (can be negative). */
function daysUntil(target: Date, now: Date): number {
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  const n = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((t - n) / 86_400_000)
}

export function computeGoalProgress(goal: Goal, now: Date = new Date()): GoalProgress {
  const percent = goalPercent(goal)
  const isAchieved = goal.status === "achieved" || percent >= 100

  let daysRemaining: number | null = null
  let isOverdue = false
  if (goal.targetDate) {
    daysRemaining = daysUntil(new Date(goal.targetDate), now)
    isOverdue = daysRemaining < 0 && !isAchieved
  }

  return { percent, isAchieved, daysRemaining, isOverdue }
}
