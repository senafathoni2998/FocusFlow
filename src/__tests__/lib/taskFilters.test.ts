import {
  applyFilters,
  applySort,
  horizonCounts,
  DEFAULT_FILTERS,
} from "@/lib/taskFilters"
import type { Task } from "@/types/task"

const NOW = new Date(2026, 6, 15, 10, 0, 0)

const mk = (o: Partial<Task> & { id: string }): Task =>
  ({
    id: o.id,
    title: o.title ?? o.id,
    description: o.description ?? null,
    status: o.status ?? "todo",
    priority: o.priority ?? "medium",
    dueDate: o.dueDate ?? null,
    order: o.order,
    priorityRank: o.priorityRank,
  } as Task)

describe("applyFilters — horizon smart lists", () => {
  const tasks = [
    mk({ id: "a", dueDate: new Date(2026, 6, 15) }), // today
    mk({ id: "b", dueDate: new Date(2026, 6, 20) }), // later this month
    mk({ id: "c", dueDate: new Date(2026, 7, 5) }), // next month
    mk({ id: "d", dueDate: null }), // no date
    mk({ id: "e", dueDate: new Date(2026, 6, 10), status: "todo" }), // overdue, open
    mk({ id: "f", dueDate: new Date(2026, 6, 10), status: "completed" }), // overdue, done
  ]

  it("thisMonth = all July tasks (incl. completed), excludes Aug & undated", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "thisMonth" }, NOW)
    expect(r.map((t) => t.id).sort()).toEqual(["a", "b", "e", "f"])
  })

  it("nextMonth = August tasks", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "nextMonth" }, NOW)
    expect(r.map((t) => t.id)).toEqual(["c"])
  })

  it("overdue excludes terminal statuses", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "overdue" }, NOW)
    expect(r.map((t) => t.id)).toEqual(["e"])
  })

  it("today folds in still-open overdue, not completed", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "today" }, NOW)
    expect(r.map((t) => t.id).sort()).toEqual(["a", "e"])
  })

  it("noDate matches only undated tasks", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "noDate" }, NOW)
    expect(r.map((t) => t.id)).toEqual(["d"])
  })

  it("all matches everything", () => {
    const r = applyFilters(tasks, { ...DEFAULT_FILTERS, horizon: "all" }, NOW)
    expect(r).toHaveLength(6)
  })
})

describe("applyFilters — status / priority / query", () => {
  const tasks = [
    mk({ id: "a", status: "todo", priority: "high", title: "Buy milk" }),
    mk({ id: "b", status: "completed", priority: "low", title: "Write report", description: "quarterly numbers" }),
    mk({ id: "c", status: "in-progress", priority: "high", title: "Milk run" }),
  ]

  it("filters by status", () => {
    expect(applyFilters(tasks, { ...DEFAULT_FILTERS, statuses: ["todo"] }).map((t) => t.id)).toEqual(["a"])
  })

  it("filters by priority", () => {
    expect(applyFilters(tasks, { ...DEFAULT_FILTERS, priorities: ["high"] }).map((t) => t.id).sort()).toEqual(["a", "c"])
  })

  it("query matches title (case-insensitive)", () => {
    expect(applyFilters(tasks, { ...DEFAULT_FILTERS, query: "MILK" }).map((t) => t.id).sort()).toEqual(["a", "c"])
  })

  it("query matches description", () => {
    expect(applyFilters(tasks, { ...DEFAULT_FILTERS, query: "quarterly" }).map((t) => t.id)).toEqual(["b"])
  })
})

describe("applySort", () => {
  it("due: ascending with nulls last", () => {
    const tasks = [
      mk({ id: "n", dueDate: null }),
      mk({ id: "b", dueDate: new Date(2026, 6, 20) }),
      mk({ id: "a", dueDate: new Date(2026, 6, 10) }),
    ]
    expect(applySort(tasks, "due").map((t) => t.id)).toEqual(["a", "b", "n"])
  })

  it("priority: high → low", () => {
    const tasks = [mk({ id: "lo", priority: "low" }), mk({ id: "hi", priority: "high" }), mk({ id: "me", priority: "medium" })]
    expect(applySort(tasks, "priority").map((t) => t.id)).toEqual(["hi", "me", "lo"])
  })

  it("title: alphabetical", () => {
    const tasks = [mk({ id: "b", title: "Banana" }), mk({ id: "a", title: "Apple" })]
    expect(applySort(tasks, "title").map((t) => t.id)).toEqual(["a", "b"])
  })

  it("manual: by order, undefined last", () => {
    const tasks = [mk({ id: "b", order: 20 }), mk({ id: "a", order: 10 }), mk({ id: "z", order: undefined })]
    expect(applySort(tasks, "manual").map((t) => t.id)).toEqual(["a", "b", "z"])
  })
})

describe("horizonCounts", () => {
  it("counts smart-list membership per horizon", () => {
    const tasks = [
      mk({ id: "a", dueDate: new Date(2026, 6, 15) }), // today
      mk({ id: "b", dueDate: new Date(2026, 6, 10), status: "todo" }), // open overdue
      mk({ id: "c", dueDate: null }), // no date
    ]
    const counts = horizonCounts(tasks, NOW)
    expect(counts.all).toBe(3)
    expect(counts.today).toBe(2) // due-today + folded open overdue
    expect(counts.overdue).toBe(1)
    expect(counts.noDate).toBe(1)
    expect(counts.thisMonth).toBe(2) // both July dated tasks
  })
})
