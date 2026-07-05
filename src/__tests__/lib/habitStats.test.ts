import { computeHabitStats, isSatisfied, isScheduledDay } from "@/lib/habitStats"
import type { Habit } from "@/types/habit"

const NOW = new Date(2026, 6, 15, 12, 0, 0) // Wed 15 Jul 2026, local

const mkHabit = (o: Partial<Habit> = {}): Habit => ({
  id: "h",
  name: "H",
  icon: "✅",
  color: "primary",
  frequencyType: o.frequencyType ?? "daily",
  weekdays: o.weekdays ?? [],
  weeklyTarget: o.weeklyTarget ?? 1,
  goalType: o.goalType ?? "achieve",
  targetAmount: o.targetAmount ?? 1,
  unit: o.unit ?? null,
  archived: false,
  createdAt: o.createdAt,
  checkIns: o.checkIns ?? [],
})

// Check-in dates stored as UTC-midnight (@db.Date convention).
const ci = (y: number, m: number, d: number, amount = 1) => ({
  id: `${y}-${m}-${d}`,
  date: new Date(Date.UTC(y, m, d)),
  amount,
})

describe("isSatisfied", () => {
  it("achieve: any positive check-in", () => {
    expect(isSatisfied(mkHabit(), 1)).toBe(true)
    expect(isSatisfied(mkHabit(), 0)).toBe(false)
  })

  it("amount: needs the target amount", () => {
    const h = mkHabit({ goalType: "amount", targetAmount: 3 })
    expect(isSatisfied(h, 2)).toBe(false)
    expect(isSatisfied(h, 3)).toBe(true)
  })
})

describe("isScheduledDay", () => {
  it("daily with no weekdays = every day", () => {
    expect(isScheduledDay(mkHabit(), NOW)).toBe(true)
  })

  it("daily with weekdays restricts to those days", () => {
    const h = mkHabit({ weekdays: [1] }) // Monday
    expect(isScheduledDay(h, new Date(2026, 6, 15))).toBe(false) // Wed
    expect(isScheduledDay(h, new Date(2026, 6, 20))).toBe(true) // Mon
  })
})

describe("computeHabitStats", () => {
  it("counts a consecutive streak including today", () => {
    const h = mkHabit({ checkIns: [ci(2026, 6, 13), ci(2026, 6, 14), ci(2026, 6, 15)] })
    const s = computeHabitStats(h, NOW)
    expect(s.currentStreak).toBe(3)
    expect(s.todayDone).toBe(true)
    expect(s.totalDays).toBe(3)
  })

  it("today not done doesn't break the streak", () => {
    const h = mkHabit({ checkIns: [ci(2026, 6, 13), ci(2026, 6, 14)] })
    const s = computeHabitStats(h, NOW)
    expect(s.currentStreak).toBe(2)
    expect(s.todayDone).toBe(false)
  })

  it("a gap breaks the current streak", () => {
    const h = mkHabit({ checkIns: [ci(2026, 6, 15), ci(2026, 6, 13)] })
    const s = computeHabitStats(h, NOW)
    expect(s.currentStreak).toBe(1)
  })

  it("best streak spans the longest run", () => {
    const h = mkHabit({ checkIns: [ci(2026, 6, 10), ci(2026, 6, 11), ci(2026, 6, 12), ci(2026, 6, 15)] })
    const s = computeHabitStats(h, NOW)
    expect(s.bestStreak).toBe(3)
    expect(s.currentStreak).toBe(1)
  })

  it("amount goal only counts satisfied days", () => {
    const h = mkHabit({ goalType: "amount", targetAmount: 3, checkIns: [ci(2026, 6, 15, 2)] })
    const s = computeHabitStats(h, NOW)
    expect(s.todayDone).toBe(false)
    expect(s.totalDays).toBe(0)
    expect(s.todayAmount).toBe(2)
  })

  it("monthly rate = satisfied / elapsed scheduled days", () => {
    const h = mkHabit({ checkIns: [ci(2026, 6, 13), ci(2026, 6, 14), ci(2026, 6, 15)] })
    const s = computeHabitStats(h, NOW)
    // Jul 1-15 = 15 daily scheduled days; 3 satisfied → 20%.
    expect(s.monthlyRate).toBe(20)
  })

  it("monthly rate ignores days before the habit was created this month", () => {
    // Created Jul 13, checked in every day since → 3/3 = 100%, not 3/15.
    const h = mkHabit({
      createdAt: new Date(2026, 6, 13),
      checkIns: [ci(2026, 6, 13), ci(2026, 6, 14), ci(2026, 6, 15)],
    })
    expect(computeHabitStats(h, NOW).monthlyRate).toBe(100)
  })

  it("monthly rate counts the whole month when created in a prior month", () => {
    // Created last month → denominator starts at day 1 (15 days), 3 satisfied → 20%.
    const h = mkHabit({
      createdAt: new Date(2026, 5, 20),
      checkIns: [ci(2026, 6, 13), ci(2026, 6, 14), ci(2026, 6, 15)],
    })
    expect(computeHabitStats(h, NOW).monthlyRate).toBe(20)
  })

  it("daily habits report a day streak unit and no weekly progress", () => {
    const s = computeHabitStats(mkHabit({ checkIns: [ci(2026, 6, 15)] }), NOW)
    expect(s.streakUnit).toBe("day")
    expect(s.weeklyProgress).toBe(0)
  })
})

// NOW = Wed 15 Jul 2026 → its Sunday-anchored week is Jul 12–18; the prior weeks
// are Jul 5–11 and Jun 28–Jul 4.
describe("computeHabitStats — weekly", () => {
  it("counts consecutive satisfied weeks (streak in weeks)", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 2,
      checkIns: [
        ci(2026, 6, 13), ci(2026, 6, 14), // current week (Jul 12–18): 2 days
        ci(2026, 6, 6), ci(2026, 6, 8), // prior week (Jul 5–11): 2 days
        ci(2026, 5, 29), ci(2026, 5, 30), // week before (Jun 28–Jul 4): 2 days
      ],
    })
    const s = computeHabitStats(h, NOW)
    expect(s.streakUnit).toBe("week")
    expect(s.currentStreak).toBe(3)
    expect(s.weeklyProgress).toBe(2)
  })

  it("an unmet current week doesn't break the streak", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 3,
      checkIns: [
        ci(2026, 6, 13), // current week: 1 day (< 3, not yet met)
        ci(2026, 6, 6), ci(2026, 6, 7), ci(2026, 6, 8), // prior week: 3 days met
      ],
    })
    const s = computeHabitStats(h, NOW)
    expect(s.currentStreak).toBe(1) // current week skipped (not broken), prior counts
    expect(s.weeklyProgress).toBe(1)
  })

  it("amount goal: a day counts toward the week only when it hits the target", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 2,
      goalType: "amount",
      targetAmount: 3,
      // Jul 13: 3 (ok), Jul 14: 1 (short), Jul 15: 3 (ok) → 2 satisfied days
      checkIns: [ci(2026, 6, 13, 3), ci(2026, 6, 14, 1), ci(2026, 6, 15, 3)],
    })
    const s = computeHabitStats(h, NOW)
    expect(s.weeklyProgress).toBe(2)
    expect(s.currentStreak).toBe(1) // 2 satisfied days ≥ target 2 → week met
  })

  it("monthly rate = satisfied / elapsed weeks anchored this month", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 1,
      createdAt: new Date(Date.UTC(2026, 5, 1)), // created June → no clamp in July
      checkIns: [ci(2026, 6, 6)], // Jul 5–11 satisfied; current Jul 12 week empty
    })
    // July-anchored weeks up to now: Jul 5 (satisfied) + Jul 12 (empty) → 1/2.
    expect(computeHabitStats(h, NOW).monthlyRate).toBe(50)
  })

  it("best streak spans the longest run of satisfied weeks", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 1,
      checkIns: [
        ci(2026, 5, 8), ci(2026, 5, 15), ci(2026, 5, 22), // Jun 7/14/21 weeks: run of 3
        // gap: Jun 28 & Jul 5 weeks empty
        ci(2026, 6, 13), // current Jul 12 week: run of 1
      ],
    })
    const s = computeHabitStats(h, NOW)
    expect(s.currentStreak).toBe(1) // broken by the two empty weeks
    expect(s.bestStreak).toBe(3) // the June run
  })

  it("monthly rate clamps out weeks before the creation week", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 1,
      createdAt: new Date(2026, 6, 13), // created this week (week of Jul 12)
      checkIns: [ci(2026, 6, 14)], // current week satisfied
    })
    // Jul 5 week is before the creation week → excluded; only Jul 12 counts → 100%.
    expect(computeHabitStats(h, NOW).monthlyRate).toBe(100)
  })

  it("doesn't count the sign-up week as a miss when it was impossible to complete", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 3,
      createdAt: new Date(2026, 6, 11), // Sat Jul 11 → only 1 day left in its week
      checkIns: [ci(2026, 6, 11), ci(2026, 6, 12), ci(2026, 6, 13), ci(2026, 6, 14)],
    })
    const s = computeHabitStats(h, NOW)
    // Creation week (Jul 5–11) could never reach 3 (1 post-signup day) → skipped;
    // only the fully-satisfied current week counts → 100%, not 50%.
    expect(s.monthlyRate).toBe(100)
    expect(s.currentStreak).toBe(1)
  })

  it("ignores check-ins dated later in the current week than now", () => {
    const h = mkHabit({
      frequencyType: "weekly",
      weeklyTarget: 2,
      checkIns: [ci(2026, 6, 15), ci(2026, 6, 17)], // today + a future day (Jul 17 > Jul 15)
    })
    // Only today counts toward this week; the future check-in is not yet real.
    expect(computeHabitStats(h, NOW).weeklyProgress).toBe(1)
  })
})
