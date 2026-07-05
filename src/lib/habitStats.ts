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
 * Whether `date` is a scheduled day for a DAILY habit — honoring an optional
 * `weekdays` allow-list (empty = every day). Weekly habits (`frequencyType:
 * "weekly"`) are scored per-week in computeHabitStats and never consult this
 * (it returns true for them), so the day-walk it drives applies only to daily.
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
  /** Unit the streak counts are in: "day" for daily habits, "week" for weekly. */
  streakUnit: "day" | "week"
  /** For a weekly habit: satisfied days so far in the current week (0 for daily). */
  weeklyProgress: number
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

  // ---- Weekly habits: score by WEEK, not by day. A week (Sunday-anchored,
  // local) is "satisfied" once it has >= weeklyTarget satisfied days; streaks
  // count consecutive satisfied weeks (the current, still-open week never breaks
  // one), and the month rate is satisfied vs elapsed weeks whose Sunday anchor
  // falls in this month (mirroring the daily rate's "today is in the denominator").
  if (habit.frequencyType === "weekly") {
    const target = Math.max(1, habit.weeklyTarget ?? 1)
    const weekStartOf = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
    const curWeekStart = weekStartOf(now)
    const weekAt = (w: number) =>
      new Date(curWeekStart.getFullYear(), curWeekStart.getMonth(), curWeekStart.getDate() - 7 * w)
    const satisfiedInWeek = (weekStart: Date): number => {
      let c = 0
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
        if (day > now) break // days that haven't happened yet don't count
        if (isSatisfied(habit, amounts.get(localDayKey(day)) ?? 0)) c++
      }
      return c
    }

    const weeklyProgress = satisfiedInWeek(curWeekStart)

    // Current streak (weeks): walk back; the current open week doesn't break it.
    let currentStreak = 0
    for (let w = 0; w < 156; w++) {
      if (satisfiedInWeek(weekAt(w)) >= target) {
        currentStreak++
      } else if (w === 0) {
        continue
      } else {
        break
      }
    }

    // Best streak (weeks) over ~2 years.
    let bestStreak = 0
    let run = 0
    for (let w = 104; w >= 0; w--) {
      if (satisfiedInWeek(weekAt(w)) >= target) {
        run++
        if (run > bestStreak) bestStreak = run
      } else {
        run = 0
      }
    }
    if (currentStreak > bestStreak) bestStreak = currentStreak

    // This-month rate: satisfied vs elapsed weeks anchored (by Sunday) in this
    // month. Don't count weeks before the habit existed, and don't count the
    // sign-up week as a miss if it was impossible to complete (fewer post-creation
    // days than the target) — mirroring how the daily path clamps to the exact
    // creation day rather than the whole period.
    const created = habit.createdAt ? new Date(habit.createdAt) : null
    const createdMidnight = created
      ? new Date(created.getFullYear(), created.getMonth(), created.getDate())
      : null
    const createdWeekStart = createdMidnight ? weekStartOf(createdMidnight) : null
    let weeks = 0
    let satisfiedWeeks = 0
    for (let w = 0; w < 6; w++) {
      const ws = weekAt(w)
      if (ws.getMonth() !== now.getMonth() || ws.getFullYear() !== now.getFullYear()) continue
      if (createdWeekStart && ws < createdWeekStart) continue
      const satisfied = satisfiedInWeek(ws)
      if (createdMidnight && createdWeekStart && ws.getTime() === createdWeekStart.getTime()) {
        // Count post-creation, elapsed days available in the sign-up week.
        let available = 0
        for (let i = 0; i < 7; i++) {
          const day = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i)
          if (day > now) break
          if (day >= createdMidnight) available++
        }
        if (available < target && satisfied < target) continue // was never achievable
      }
      weeks++
      if (satisfied >= target) satisfiedWeeks++
    }
    const monthlyRate = weeks > 0 ? Math.round((satisfiedWeeks / weeks) * 100) : 0

    return {
      currentStreak,
      bestStreak,
      totalDays,
      monthlyRate,
      todayDone,
      todayAmount,
      streakUnit: "week",
      weeklyProgress,
    }
  }

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

  return {
    currentStreak,
    bestStreak,
    totalDays,
    monthlyRate,
    todayDone,
    todayAmount,
    streakUnit: "day",
    weeklyProgress: 0,
  }
}
