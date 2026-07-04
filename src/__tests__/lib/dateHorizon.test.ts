import { resolveHorizon, matchesHorizon, bucketByHorizon } from "@/lib/dateHorizon"
import type { Task } from "@/types/task"

// Fixed reference point: Wednesday, 15 July 2026, 10:30 local time.
const NOW = new Date(2026, 6, 15, 10, 30, 0)

const mk = (id: string, dueDate: Date | null, status = "todo"): Task =>
  ({ id, title: id, status, priority: "medium", dueDate } as Task)

describe("resolveHorizon (half-open [start,end), local, calendar-aligned)", () => {
  it("today = [startOfDay, +1d)", () => {
    const r = resolveHorizon("today", NOW)
    expect(r.start).toEqual(new Date(2026, 6, 15))
    expect(r.end).toEqual(new Date(2026, 6, 16))
  })

  it("tomorrow = [+1d, +2d)", () => {
    const r = resolveHorizon("tomorrow", NOW)
    expect(r.start).toEqual(new Date(2026, 6, 16))
    expect(r.end).toEqual(new Date(2026, 6, 17))
  })

  it("next7days = [today, +7d)", () => {
    const r = resolveHorizon("next7days", NOW)
    expect(r.start).toEqual(new Date(2026, 6, 15))
    expect(r.end).toEqual(new Date(2026, 6, 22))
  })

  it("thisMonth = calendar month", () => {
    const r = resolveHorizon("thisMonth", NOW)
    expect(r.start).toEqual(new Date(2026, 6, 1))
    expect(r.end).toEqual(new Date(2026, 7, 1))
  })

  it("nextMonth = following calendar month", () => {
    const r = resolveHorizon("nextMonth", NOW)
    expect(r.start).toEqual(new Date(2026, 7, 1))
    expect(r.end).toEqual(new Date(2026, 8, 1))
  })

  it("thisYear = Jan 1 → next Jan 1", () => {
    const r = resolveHorizon("thisYear", NOW)
    expect(r.start).toEqual(new Date(2026, 0, 1))
    expect(r.end).toEqual(new Date(2027, 0, 1))
  })

  it("nextYear = following calendar year", () => {
    const r = resolveHorizon("nextYear", NOW)
    expect(r.start).toEqual(new Date(2027, 0, 1))
    expect(r.end).toEqual(new Date(2028, 0, 1))
  })

  it("overdue ends at start of today", () => {
    const r = resolveHorizon("overdue", NOW)
    expect(r.kind).toBe("overdue")
    expect(r.end).toEqual(new Date(2026, 6, 15))
  })

  it("all / noDate carry null bounds", () => {
    expect(resolveHorizon("all", NOW).start).toBeNull()
    expect(resolveHorizon("all", NOW).end).toBeNull()
    expect(resolveHorizon("noDate", NOW).kind).toBe("noDate")
  })

  it("custom is inclusive 'from' and exclusive day-after 'to'", () => {
    const r = resolveHorizon("custom", NOW, { from: new Date(2026, 6, 10), to: new Date(2026, 6, 20) })
    expect(r.start).toEqual(new Date(2026, 6, 10))
    expect(r.end).toEqual(new Date(2026, 6, 21))
  })
})

describe("matchesHorizon", () => {
  const thisMonth = resolveHorizon("thisMonth", NOW)

  it("includes the inclusive start boundary", () => {
    expect(matchesHorizon(new Date(2026, 6, 1), thisMonth)).toBe(true)
  })

  it("excludes the exclusive end boundary", () => {
    expect(matchesHorizon(new Date(2026, 7, 1), thisMonth)).toBe(false)
  })

  it("includes a mid-range date", () => {
    expect(matchesHorizon(new Date(2026, 6, 20), thisMonth)).toBe(true)
  })

  it("all matches everything, including null", () => {
    const all = resolveHorizon("all", NOW)
    expect(matchesHorizon(null, all)).toBe(true)
    expect(matchesHorizon(new Date(), all)).toBe(true)
  })

  it("noDate matches only null due dates", () => {
    const nd = resolveHorizon("noDate", NOW)
    expect(matchesHorizon(null, nd)).toBe(true)
    expect(matchesHorizon(new Date(2026, 6, 15), nd)).toBe(false)
  })

  it("overdue matches strictly-past dates only", () => {
    const od = resolveHorizon("overdue", NOW)
    expect(matchesHorizon(new Date(2026, 6, 14), od)).toBe(true)
    expect(matchesHorizon(new Date(2026, 6, 15), od)).toBe(false)
  })
})

describe("bucketByHorizon", () => {
  it("groups into ordered, non-empty bands (first-match)", () => {
    const tasks = [
      mk("later", new Date(2026, 9, 1)),
      mk("overdue", new Date(2026, 6, 10)),
      mk("today", new Date(2026, 6, 15, 14)),
      mk("nodate", null),
    ]
    const buckets = bucketByHorizon(tasks, NOW)
    expect(buckets.map((b) => b.key)).toEqual(["overdue", "today", "later", "noDate"])
    expect(buckets.find((b) => b.key === "today")!.tasks.map((t) => t.id)).toEqual(["today"])
  })

  it("omits empty bands", () => {
    const buckets = bucketByHorizon([mk("t", new Date(2026, 6, 15))], NOW)
    expect(buckets.map((b) => b.key)).toEqual(["today"])
  })
})
