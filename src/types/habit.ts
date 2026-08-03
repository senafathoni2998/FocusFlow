export interface HabitCheckInSummary {
  id: string
  date: Date | string
  amount: number
}

/** Client-facing habit shape (mirrors the Prisma model + optional check-ins). */
export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  frequencyType: string // daily | weekly
  weekdays: number[]
  weeklyTarget: number
  goalType: string // achieve | amount
  targetAmount?: number | null
  unit?: string | null
  archived: boolean
  order?: number
  createdAt?: Date | string
  checkIns?: HabitCheckInSummary[]
  /**
   * Exact number of satisfied days over the habit's whole life.
   *
   * `checkIns` is fetched with a `take` cap (the streak walks only need a few
   * years, and shipping every row would bloat the payload), so counting the
   * array saturates once a habit passes that many check-in days. When the
   * fetcher supplies this, computeHabitStats trusts it over the capped array.
   */
  totalCheckInDays?: number
}

export const HABIT_COLORS = ["primary", "success", "warning", "danger"] as const
export type HabitColor = (typeof HABIT_COLORS)[number]

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
