import { parseQuickAdd, hasDateHint } from "@/lib/quickAddParser"
import { addDays, addWeeks, startOfDay } from "date-fns"

// Fixed anchor so relative dates are deterministic. 2026-07-13 is a Monday.
const NOW = new Date(2026, 6, 13, 9, 30)

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`

describe("parseQuickAdd", () => {
  it("extracts #tags, dedupes them, and strips them from the title", () => {
    const r = parseQuickAdd("Email the team #work #Work #urgent-thing", NOW)
    expect(r.title).toBe("Email the team")
    expect(r.tags).toEqual(["work", "urgent-thing"])
  })

  it("reads word-form priority and strips it", () => {
    expect(parseQuickAdd("Ship it !high", NOW).priority).toBe("high")
    expect(parseQuickAdd("Ship it !medium", NOW).priority).toBe("medium")
    expect(parseQuickAdd("Ship it !low", NOW).priority).toBe("low")
    expect(parseQuickAdd("Ship it !none", NOW).priority).toBe("none")
    expect(parseQuickAdd("Ship it !high", NOW).title).toBe("Ship it")
  })

  it("reads exclamation-shorthand priority (!!! / !! / !)", () => {
    expect(parseQuickAdd("Do it !!!", NOW).priority).toBe("high")
    expect(parseQuickAdd("Do it !!", NOW).priority).toBe("medium")
    expect(parseQuickAdd("Do it !", NOW).priority).toBe("low")
  })

  it("takes the LAST priority regardless of form (positional, not form-order)", () => {
    expect(parseQuickAdd("Task !!! !low", NOW).priority).toBe("low")
    expect(parseQuickAdd("Task !low !!!", NOW).priority).toBe("high")
  })

  it("does not treat trailing sentence punctuation as a priority", () => {
    const r = parseQuickAdd("Call mom!", NOW)
    expect(r.priority).toBeUndefined()
    expect(r.title).toBe("Call mom!")
  })

  it("resolves today / tonight / tomorrow", () => {
    expect(parseQuickAdd("Standup today", NOW).dueDate).toBe(ymd(NOW))
    expect(parseQuickAdd("Standup tonight", NOW).dueDate).toBe(ymd(NOW))
    expect(parseQuickAdd("Standup tomorrow", NOW).dueDate).toBe(ymd(addDays(NOW, 1)))
    expect(parseQuickAdd("Standup tmr", NOW).dueDate).toBe(ymd(addDays(NOW, 1)))
  })

  it("resolves 'in N days' and 'in N weeks'", () => {
    expect(parseQuickAdd("Review in 3 days", NOW).dueDate).toBe(ymd(addDays(NOW, 3)))
    expect(parseQuickAdd("Review in 2 weeks", NOW).dueDate).toBe(ymd(addWeeks(NOW, 2)))
  })

  it("resolves 'next week' to +7 days", () => {
    expect(parseQuickAdd("Plan next week", NOW).dueDate).toBe(ymd(addDays(NOW, 7)))
  })

  it("resolves a bare weekday to the upcoming occurrence and strips it", () => {
    const r = parseQuickAdd("Gym friday", NOW)
    expect(r.title).toBe("Gym")
    const d = new Date(r.dueDate + "T00:00:00")
    expect(d.getDay()).toBe(5) // Friday
    const diff = Math.round((startOfDay(d).getTime() - startOfDay(NOW).getTime()) / 86400000)
    expect(diff).toBeGreaterThanOrEqual(0)
    expect(diff).toBeLessThan(7)
  })

  it("treats a weekday that IS today as today", () => {
    // NOW is a Monday.
    expect(parseQuickAdd("Standup monday", NOW).dueDate).toBe(ymd(NOW))
  })

  it("leaves 'next <weekday>' for the AI (not matched deterministically)", () => {
    const r = parseQuickAdd("Demo next friday", NOW)
    expect(r.matchedDate).toBe(false)
    expect(r.dueDate).toBeUndefined()
    expect(r.title).toBe("Demo next friday")
    expect(hasDateHint(r.title)).toBe(true)
  })

  it("does not let a stray double space defeat the 'next <weekday>' guard", () => {
    const r = parseQuickAdd("Demo next  friday", NOW)
    expect(r.matchedDate).toBe(false)
    expect(r.title).toBe("Demo next friday")
  })

  it("does NOT treat 3-letter weekday-lookalikes as dates", () => {
    // "sun cream" / "SAT scores" must not resolve to a weekday.
    const sun = parseQuickAdd("Buy sun cream", NOW)
    expect(sun.matchedDate).toBe(false)
    expect(sun.title).toBe("Buy sun cream")
    const sat = parseQuickAdd("Review SAT scores", NOW)
    expect(sat.matchedDate).toBe(false)
    expect(sat.title).toBe("Review SAT scores")
  })

  it("does NOT treat a fraction/ratio as an M/D date", () => {
    const r = parseQuickAdd("Buy 1/2 gallon milk", NOW)
    expect(r.matchedDate).toBe(false)
    expect(r.title).toBe("Buy 1/2 gallon milk")
  })

  it("captures accented (unicode) tags without leaking a fragment into the title", () => {
    const r = parseQuickAdd("Lunch #café", NOW)
    expect(r.tags).toEqual(["café"])
    expect(r.title).toBe("Lunch")
  })

  it("ignores an absurd 'in N days' offset instead of producing an invalid date", () => {
    const r = parseQuickAdd("Ping in 99999999 days", NOW)
    expect(r.matchedDate).toBe(false)
  })

  it("resolves 'this weekend' to the upcoming Saturday", () => {
    const r = parseQuickAdd("Trip this weekend", NOW)
    const d = new Date(r.dueDate + "T00:00:00")
    expect(d.getDay()).toBe(6)
  })

  it("parses an explicit ISO date and rejects an impossible one", () => {
    expect(parseQuickAdd("Launch 2026-09-01", NOW).dueDate).toBe("2026-09-01")
    const bad = parseQuickAdd("Launch 2026-02-30", NOW)
    expect(bad.matchedDate).toBe(false)
    expect(bad.dueDate).toBeUndefined()
  })

  it("parses M/D/Y (explicit year required to avoid fraction ambiguity)", () => {
    expect(parseQuickAdd("Event 3/4/2028", NOW).dueDate).toBe("2028-03-04")
    expect(parseQuickAdd("Pay 8/15/26", NOW).dueDate).toBe("2026-08-15")
    // Year-less M/D is intentionally NOT a date (see fraction test above).
    expect(parseQuickAdd("Pay 8/15", NOW).matchedDate).toBe(false)
  })

  it("parses a full combined line", () => {
    const r = parseQuickAdd("Pay rent tomorrow #home !high", NOW)
    expect(r).toEqual({
      title: "Pay rent",
      tags: ["home"],
      priority: "high",
      dueDate: ymd(addDays(NOW, 1)),
      matchedDate: true,
    })
  })

  it("collapses whitespace left by stripped tokens", () => {
    const r = parseQuickAdd("  Buy   milk   #home   ", NOW)
    expect(r.title).toBe("Buy milk")
  })

  it("returns a plain title with no tokens", () => {
    const r = parseQuickAdd("Buy milk", NOW)
    expect(r).toEqual({ title: "Buy milk", tags: [], priority: undefined, dueDate: undefined, matchedDate: false })
    expect(hasDateHint("Buy milk")).toBe(false)
  })
})

describe("hasDateHint", () => {
  it("flags fuzzy date phrases the deterministic parser skips", () => {
    expect(hasDateHint("end of month")).toBe(true)
    expect(hasDateHint("aug 1")).toBe(true)
    expect(hasDateHint("1 aug")).toBe(true)
    expect(hasDateHint("next friday")).toBe(true)
    expect(hasDateHint("next month")).toBe(true)
    expect(hasDateHint("the 15th")).toBe(true)
    expect(hasDateHint("in 2 months")).toBe(true)
    expect(hasDateHint("next payday")).toBe(true)
  })

  it("does NOT flag ordinary words that merely contain a month/modal/number", () => {
    // These previously over-triggered a needless AI call.
    expect(hasDateHint("Email May about the budget")).toBe(false)
    expect(hasDateHint("Plan next sprint")).toBe(false)
    expect(hasDateHint("Buy 1/2 gallon milk")).toBe(false)
    expect(hasDateHint("Review SAT scores")).toBe(false)
    expect(hasDateHint("Buy milk")).toBe(false)
    expect(hasDateHint("someday maybe")).toBe(false)
  })
})
