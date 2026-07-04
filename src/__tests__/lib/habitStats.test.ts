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
})
