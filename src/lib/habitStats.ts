import type { Habit, HabitCheckInSummary } from "@/types/habit"

/**
 * Pure habit statistics: frequency-aware current/best streaks, total satisfied
 * days, and this-month completion rate.
 *
 * Timezone note: check-in dates are stored as `@db.Date` (UTC midnight), so we
 * key them by their UTC calendar day; "today" and the streak walk use LOCAL
 * calendar days. checkInHabit stores `Date.UTC(localY, localM, localD)`, so a
 * check-in made on a given local day keys to that same day — the two agree.
 */

function utcDayKey(d: Date | string): string {
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

/** Local calendar-day key for a walked day (used to look up amounts by day). */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function isSatisfied(habit: Habit, amount: number): boolean {
  if (habit.goalType === "amount") return amount >= (habit.targetAmount ?? 1)
  return amount >= 1
}

/**
 * Whether `date` is a scheduled day. Daily habits honor an optional `weekdays`
 * allow-list. NOTE: `frequencyType: "weekly"` with a per-week `weeklyTarget` is
 * NOT yet scored here (every day is treated as a candidate, so a weekly habit
 * would score as must-do-daily). The create/edit form deliberately does not
 * expose frequency/weekly controls yet — do not until this handles it.
 */
export function isScheduledDay(habit: Habit, date: Date): boolean {
  if (habit.frequencyType !== "daily") return true
  if (!habit.weekdays || habit.weekdays.length === 0) return true
  return habit.weekdays.includes(date.getDay())
}

export interface HabitStats {
  currentStreak: number
  bestStreak: number
  totalDays: number
  monthlyRate: number // 0-100
  todayDone: boolean
  todayAmount: number
}

/** Sum check-in amounts per calendar day, keyed to match `localDayKey` lookups. */
export function amountsByDay(checkIns: HabitCheckInSummary[] | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const ci of checkIns ?? []) {
    const key = utcDayKey(ci.date)
    m.set(key, (m.get(key) ?? 0) + ci.amount)
  }
  return m
}

export function computeHabitStats(habit: Habit, now: Date = new Date()): HabitStats {
  const amounts = amountsByDay(habit.checkIns)

  const todayAmount = amounts.get(localDayKey(now)) ?? 0
  const todayDone = isSatisfied(habit, todayAmount)

  let totalDays = 0
  for (const [, amt] of amounts) if (isSatisfied(habit, amt)) totalDays++

  const dayAt = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)

  // Current streak: walk back over scheduled days; today-not-yet-done doesn't break.
  let currentStreak = 0
  for (let i = 0; i < 366 * 3; i++) {
    const day = dayAt(i)
    if (!isScheduledDay(habit, day)) continue
    const amt = amounts.get(localDayKey(day)) ?? 0
    if (isSatisfied(habit, amt)) {
      currentStreak++
    } else if (i === 0) {
      continue
    } else {
      break
    }
  }

  // Best streak over ~2 years of scheduled days.
  let bestStreak = 0
  let run = 0
  for (let i = 366 * 2; i >= 0; i--) {
    const day = dayAt(i)
    if (!isScheduledDay(habit, day)) continue
    const amt = amounts.get(localDayKey(day)) ?? 0
    if (isSatisfied(habit, amt)) {
      run++
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }
  if (currentStreak > bestStreak) bestStreak = currentStreak

  // This-month rate: satisfied scheduled days / scheduled days elapsed this month.
  // Don't count days before the habit existed as misses: if it was created this
  // month, start the denominator at its creation day.
  let startDay = 1
  if (habit.createdAt) {
    const created = new Date(habit.createdAt)
    if (created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()) {
      startDay = Math.max(1, created.getDate())
    }
  }
  let scheduled = 0
  let satisfied = 0
  for (let d = startDay; d <= now.getDate(); d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d)
    if (!isScheduledDay(habit, day)) continue
    scheduled++
    if (isSatisfied(habit, amounts.get(localDayKey(day)) ?? 0)) satisfied++
  }
  const monthlyRate = scheduled > 0 ? Math.round((satisfied / scheduled) * 100) : 0

  return { currentStreak, bestStreak, totalDays, monthlyRate, todayDone, todayAmount }
}
