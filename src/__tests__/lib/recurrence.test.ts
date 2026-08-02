import { computeNextOccurrence, isRecurrenceFreq, shiftedReminders } from "@/lib/recurrence"

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

  it("monthly-on-the-31st does not drift: clamps in short months but recovers", () => {
    // Anchored Jan 31 2026; each roll computes from the ORIGINAL anchor.
    const rule = (completedCount: number) => ({
      freq: "monthly",
      interval: 1,
      anchorMode: "due",
      anchorDate: D(2026, 0, 31),
      completedCount,
    })
    // completing the Jan 31 occurrence (n=1) -> Feb 28 (clamped)
    expect(computeNextOccurrence(rule(0), D(2026, 0, 31))).toEqual(D(2026, 1, 28))
    // completing the Feb 28 occurrence (n=2) -> Mar 31 (RECOVERS, not Mar 28)
    expect(computeNextOccurrence(rule(1), D(2026, 1, 28))).toEqual(D(2026, 2, 31))
    // (n=3) -> Apr 30 (clamped again)
    expect(computeNextOccurrence(rule(2), D(2026, 2, 31))).toEqual(D(2026, 3, 30))
  })

  it("yearly-on-Feb-29 recovers on the next leap year", () => {
    const rule = (completedCount: number) => ({
      freq: "yearly",
      interval: 1,
      anchorMode: "due",
      anchorDate: D(2024, 1, 29), // leap day
      completedCount,
    })
    expect(computeNextOccurrence(rule(0), D(2024, 1, 29))).toEqual(D(2025, 1, 28)) // clamp
    expect(computeNextOccurrence(rule(3), D(2027, 1, 28))).toEqual(D(2028, 1, 29)) // recover (2028 leap)
  })

  it("ignores the anchor in completion mode (rolls from the completion date)", () => {
    const next = computeNextOccurrence(
      { freq: "monthly", interval: 1, anchorMode: "completion", anchorDate: D(2026, 0, 31), completedCount: 5 },
      D(2026, 2, 10), // completed on Mar 10
    )
    expect(next).toEqual(D(2026, 3, 10)) // Apr 10, from the completion date
  })

  it("falls back to from-based rolls when no anchor is stored (legacy rules)", () => {
    expect(computeNextOccurrence({ freq: "monthly", interval: 1 }, D(2026, 0, 31))).toEqual(D(2026, 1, 28))
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

describe("shiftedReminders", () => {
  it("moves each reminder by the same delta the task's date moved", () => {
    // Due 15 Jun, reminder 20 minutes before it. Rolling to 16 Jun must keep the
    // reminder 20 minutes before the NEW due date, not leave it on the 15th.
    const due = new Date(2026, 5, 15, 9, 0)
    const next = new Date(2026, 5, 16, 9, 0)
    const reminders = [{ id: "r1", triggerAt: new Date(2026, 5, 15, 8, 40) }]

    expect(shiftedReminders(reminders, due, next)).toEqual([
      { id: "r1", triggerAt: new Date(2026, 5, 16, 8, 40) },
    ])
  })

  it("shifts every reminder on the task, preserving their spacing", () => {
    const due = new Date(2026, 5, 15, 9, 0)
    const next = new Date(2026, 5, 22, 9, 0) // weekly
    const reminders = [
      { id: "r1", triggerAt: new Date(2026, 5, 14, 9, 0) }, // a day before
      { id: "r2", triggerAt: new Date(2026, 5, 15, 8, 30) }, // 30 min before
    ]

    expect(shiftedReminders(reminders, due, next)).toEqual([
      { id: "r1", triggerAt: new Date(2026, 5, 21, 9, 0) },
      { id: "r2", triggerAt: new Date(2026, 5, 22, 8, 30) },
    ])
  })

  it("accepts ISO strings as well as Dates", () => {
    const out = shiftedReminders(
      [{ id: "r1", triggerAt: new Date(2026, 5, 15, 8, 40).toISOString() }],
      new Date(2026, 5, 15, 9, 0),
      new Date(2026, 5, 16, 9, 0),
    )
    expect(out).toEqual([{ id: "r1", triggerAt: new Date(2026, 5, 16, 8, 40) }])
  })

  it("is a no-op when there is nothing to shift", () => {
    const due = new Date(2026, 5, 15)
    expect(shiftedReminders([], due, new Date(2026, 5, 16))).toEqual([])
    expect(shiftedReminders(undefined, due, new Date(2026, 5, 16))).toEqual([])
    // No previous reference date: the offset is undefined, so leave them alone.
    expect(shiftedReminders([{ id: "r1", triggerAt: due }], null, new Date(2026, 5, 16))).toEqual([])
    // Same date in and out.
    expect(shiftedReminders([{ id: "r1", triggerAt: due }], due, due)).toEqual([])
  })
})
