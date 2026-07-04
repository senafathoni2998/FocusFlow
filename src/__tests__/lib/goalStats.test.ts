import { computeGoalProgress, goalPercent } from "@/lib/goalStats"
import type { Goal } from "@/types/goal"

const NOW = new Date(2026, 6, 15, 12, 0, 0) // Wed 15 Jul 2026, local

const mk = (o: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Goal",
  icon: "🎯",
  color: "primary",
  progressType: o.progressType ?? "manual",
  targetValue: o.targetValue ?? null,
  currentValue: o.currentValue ?? 0,
  unit: o.unit ?? null,
  manualProgress: o.manualProgress ?? 0,
  targetDate: o.targetDate ?? null,
  status: o.status ?? "active",
  taskTotal: o.taskTotal,
  taskCompleted: o.taskCompleted,
})

// Target dates are calendar-day deadlines stored at UTC midnight.
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

describe("goalPercent", () => {
  it("manual: clamps to 0-100", () => {
    expect(goalPercent(mk({ manualProgress: 40 }))).toBe(40)
    expect(goalPercent(mk({ manualProgress: 150 }))).toBe(100)
    expect(goalPercent(mk({ manualProgress: -5 }))).toBe(0)
  })

  it("numeric: current / target, rounded and clamped", () => {
    expect(goalPercent(mk({ progressType: "numeric", currentValue: 5, targetValue: 12 }))).toBe(42)
    expect(goalPercent(mk({ progressType: "numeric", currentValue: 20, targetValue: 10 }))).toBe(100)
  })

  it("numeric: zero or absent target = 0 (no divide by zero)", () => {
    expect(goalPercent(mk({ progressType: "numeric", currentValue: 5, targetValue: 0 }))).toBe(0)
    expect(goalPercent(mk({ progressType: "numeric", currentValue: 5, targetValue: null }))).toBe(0)
  })

  it("tasks: completed / total, with no tasks = 0", () => {
    expect(goalPercent(mk({ progressType: "tasks", taskCompleted: 3, taskTotal: 4 }))).toBe(75)
    expect(goalPercent(mk({ progressType: "tasks", taskCompleted: 0, taskTotal: 0 }))).toBe(0)
  })
})

describe("computeGoalProgress", () => {
  it("is achieved when percent reaches 100", () => {
    const p = computeGoalProgress(mk({ manualProgress: 100 }), NOW)
    expect(p.percent).toBe(100)
    expect(p.isAchieved).toBe(true)
  })

  it("is achieved when status is 'achieved' regardless of percent", () => {
    expect(computeGoalProgress(mk({ status: "achieved", manualProgress: 10 }), NOW).isAchieved).toBe(true)
  })

  it("no target date = null countdown, never overdue", () => {
    const p = computeGoalProgress(mk(), NOW)
    expect(p.daysRemaining).toBeNull()
    expect(p.isOverdue).toBe(false)
  })

  it("counts whole days to a future deadline", () => {
    const p = computeGoalProgress(mk({ targetDate: utcDate(2026, 6, 25) }), NOW)
    expect(p.daysRemaining).toBe(10)
    expect(p.isOverdue).toBe(false)
  })

  it("a past deadline is overdue when unachieved", () => {
    const p = computeGoalProgress(mk({ targetDate: utcDate(2026, 6, 10) }), NOW)
    expect(p.daysRemaining).toBe(-5)
    expect(p.isOverdue).toBe(true)
  })

  it("a past deadline is not overdue once achieved", () => {
    const p = computeGoalProgress(mk({ targetDate: utcDate(2026, 6, 10), status: "achieved" }), NOW)
    expect(p.isOverdue).toBe(false)
  })
})
