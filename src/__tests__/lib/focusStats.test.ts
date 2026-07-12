import { computeFocusStats } from "@/lib/focusStats"

// Fixed anchor so the day-walk is deterministic.
const NOW = new Date(2026, 6, 15, 12, 0) // Wed Jul 15 2026, local noon
const at = (daysAgo: number, hour = 10) => new Date(2026, 6, 15 - daysAgo, hour, 0)

describe("computeFocusStats", () => {
  it("counts a current streak of consecutive focus days including today", () => {
    const s = computeFocusStats([at(0), at(1), at(2)], NOW)
    expect(s.currentStreak).toBe(3)
    expect(s.todayCount).toBe(1)
  })

  it("does not break the streak when today hasn't been focused yet", () => {
    const s = computeFocusStats([at(1), at(2), at(3)], NOW)
    expect(s.currentStreak).toBe(3)
    expect(s.todayCount).toBe(0)
  })

  it("breaks the current streak on a gap", () => {
    // today, yesterday, then a gap at -2, then -3, -4
    const s = computeFocusStats([at(0), at(1), at(3), at(4)], NOW)
    expect(s.currentStreak).toBe(2)
  })

  it("treats multiple sessions in a day as one focus day (todayCount counts all)", () => {
    const s = computeFocusStats([at(0, 9), at(0, 11), at(0, 14)], NOW)
    expect(s.currentStreak).toBe(1)
    expect(s.todayCount).toBe(3)
    expect(s.totalDays).toBe(1)
  })

  it("computes the best streak over history independent of the current one", () => {
    // current 2-day run + a past 4-day run separated by a gap
    const s = computeFocusStats([at(0), at(1), at(5), at(6), at(7), at(8)], NOW)
    expect(s.currentStreak).toBe(2)
    expect(s.bestStreak).toBe(4)
  })

  it("returns zeros for an empty history", () => {
    expect(computeFocusStats([], NOW)).toEqual({
      currentStreak: 0,
      bestStreak: 0,
      todayCount: 0,
      totalDays: 0,
    })
  })

  it("accepts ISO strings as well as Dates", () => {
    const s = computeFocusStats([at(0).toISOString(), at(1).toISOString()], NOW)
    expect(s.currentStreak).toBe(2)
  })

  it("continues the streak across a month boundary", () => {
    const now = new Date(2026, 7, 2, 12, 0) // Sun Aug 2 2026
    const starts = [
      new Date(2026, 7, 2, 10), // Aug 2
      new Date(2026, 7, 1, 10), // Aug 1
      new Date(2026, 6, 31, 10), // Jul 31
      new Date(2026, 6, 30, 10), // Jul 30
    ]
    expect(computeFocusStats(starts, now).currentStreak).toBe(4)
  })
})
