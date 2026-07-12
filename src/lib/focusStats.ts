import { localDayKey } from "@/lib/habitStats"

/**
 * Pure focus-streak statistics. A "focus day" is any LOCAL calendar day with at
 * least one completed pomodoro session — mirroring the habit-streak "≥1 satisfied"
 * predicate so the 🔥 here behaves like the one users already know.
 *
 * Timezone note: `startTime` is a real instant. We bucket by LOCAL calendar day
 * (same as habitStats' streak walk), so this must be computed CLIENT-SIDE after
 * mount — the server's timezone would bucket edge-of-day sessions differently.
 */

export interface FocusStats {
  currentStreak: number
  bestStreak: number
  /** Completed pomodoros today. */
  todayCount: number
  /** Distinct focus days on record (within the provided window). */
  totalDays: number
}

/** Count completed-pomodoro sessions per LOCAL calendar day. */
function countsByDay(starts: (Date | string)[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of starts) {
    const key = localDayKey(new Date(s))
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}

export function computeFocusStats(
  starts: (Date | string)[],
  now: Date = new Date(),
): FocusStats {
  const counts = countsByDay(starts)
  const dayAt = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
  const done = (day: Date) => (counts.get(localDayKey(day)) ?? 0) >= 1

  const todayCount = counts.get(localDayKey(now)) ?? 0

  let totalDays = 0
  for (const [, c] of counts) if (c >= 1) totalDays++

  // Current streak: walk back from today; a not-yet-focused TODAY doesn't break it.
  let currentStreak = 0
  for (let i = 0; i < 366 * 3; i++) {
    if (done(dayAt(i))) {
      currentStreak++
    } else if (i === 0) {
      continue
    } else {
      break
    }
  }

  // Best streak over ~2 years.
  let bestStreak = 0
  let run = 0
  for (let i = 366 * 2; i >= 0; i--) {
    if (done(dayAt(i))) {
      run++
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }
  if (currentStreak > bestStreak) bestStreak = currentStreak

  return { currentStreak, bestStreak, todayCount, totalDays }
}
