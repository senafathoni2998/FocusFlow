import { computeNextOccurrence, isRecurrenceFreq } from "@/lib/recurrence"

const D = (y: number, m: number, d: number) => new Date(y, m, d)

describe("computeNextOccurrence", () => {
  it("daily adds interval days", () => {
    expect(computeNextOccurrence({ freq: "daily", interval: 1 }, D(2026, 6, 15))).toEqual(D(2026, 6, 16))
    expect(computeNextOccurrence({ freq: "daily", interval: 3 }, D(2026, 6, 15))).toEqual(D(2026, 6, 18))
  })

  it("weekly adds interval weeks when no byWeekday", () => {
    expect(computeNextOccurrence({ freq: "weekly", interval: 1 }, D(2026, 6, 15))).toEqual(D(2026, 6, 22))
  })

  it("weekly with byWeekday finds the next matching weekday", () => {
    // Jul 15 2026 is a Wednesday; next Monday (1) is Jul 20.
    expect(computeNextOccurrence({ freq: "weekly", byWeekday: [1] }, D(2026, 6, 15))).toEqual(D(2026, 6, 20))
  })

  it("monthly adds interval months", () => {
    expect(computeNextOccurrence({ freq: "monthly", interval: 1 }, D(2026, 6, 15))).toEqual(D(2026, 7, 15))
  })

  it("yearly adds interval years", () => {
    expect(computeNextOccurrence({ freq: "yearly", interval: 1 }, D(2026, 6, 15))).toEqual(D(2027, 6, 15))
  })

  it("defaults interval to 1 when missing/invalid", () => {
    expect(computeNextOccurrence({ freq: "daily" }, D(2026, 6, 15))).toEqual(D(2026, 6, 16))
    expect(computeNextOccurrence({ freq: "daily", interval: 0 }, D(2026, 6, 15))).toEqual(D(2026, 6, 16))
  })

  it("returns null past 'until'", () => {
    expect(computeNextOccurrence({ freq: "daily", until: D(2026, 6, 15) }, D(2026, 6, 15))).toBeNull()
    expect(computeNextOccurrence({ freq: "daily", until: D(2026, 6, 20) }, D(2026, 6, 15))).toEqual(D(2026, 6, 16))
  })

  it("returns null when the count limit is reached", () => {
    expect(computeNextOccurrence({ freq: "daily", count: 3, completedCount: 2 }, D(2026, 6, 15))).toBeNull()
    expect(computeNextOccurrence({ freq: "daily", count: 3, completedCount: 1 }, D(2026, 6, 15))).toEqual(D(2026, 6, 16))
  })

  it("unknown freq returns null", () => {
    expect(computeNextOccurrence({ freq: "bogus" }, D(2026, 6, 15))).toBeNull()
  })
})

describe("isRecurrenceFreq", () => {
  it("validates freq strings", () => {
    expect(isRecurrenceFreq("daily")).toBe(true)
    expect(isRecurrenceFreq("yearly")).toBe(true)
    expect(isRecurrenceFreq("bogus")).toBe(false)
    expect(isRecurrenceFreq(null)).toBe(false)
  })
})
