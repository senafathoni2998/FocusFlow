import { addDays, addWeeks, addMonths, addYears, isAfter } from "date-fns"

/**
 * Pure recurrence engine. A recurring task rolls the SAME row forward to the
 * date returned here on completion; null means the rule is exhausted.
 */

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly"

export const RECURRENCE_FREQS: RecurrenceFreq[] = ["daily", "weekly", "monthly", "yearly"]

export const RECURRENCE_LABELS: Record<RecurrenceFreq, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
}

export function isRecurrenceFreq(v: string | null | undefined): v is RecurrenceFreq {
  return v != null && (RECURRENCE_FREQS as string[]).includes(v)
}

export interface RecurrenceLike {
  freq: string
  interval?: number
  byWeekday?: number[]
  until?: Date | string | null
  count?: number | null
  completedCount?: number
}

/**
 * The next occurrence strictly after `from`, or null when exhausted (the count
 * limit is reached, or the next date would be past `until`).
 */
export function computeNextOccurrence(rule: RecurrenceLike, from: Date): Date | null {
  // count = total occurrences; this completion makes it completedCount + 1.
  if (rule.count != null && (rule.completedCount ?? 0) + 1 >= rule.count) return null

  const interval = rule.interval && rule.interval > 0 ? rule.interval : 1
  let next: Date
  switch (rule.freq) {
    case "daily":
      next = addDays(from, interval)
      break
    case "weekly":
      next =
        rule.byWeekday && rule.byWeekday.length > 0
          ? nextWeekday(from, rule.byWeekday)
          : addWeeks(from, interval)
      break
    case "monthly":
      next = addMonths(from, interval)
      break
    case "yearly":
      next = addYears(from, interval)
      break
    default:
      return null
  }

  if (rule.until && isAfter(next, new Date(rule.until))) return null
  return next
}

/** The next calendar day strictly after `from` whose weekday is in the set. */
function nextWeekday(from: Date, weekdays: number[]): Date {
  const days = Array.from(new Set(weekdays))
  for (let i = 1; i <= 7; i++) {
    const cand = addDays(from, i)
    if (days.includes(cand.getDay())) return cand
  }
  return addWeeks(from, 1)
}
