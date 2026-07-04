import { render } from "@testing-library/react"
import HabitHeatmap from "@/components/habits/HabitHeatmap"
import type { Habit } from "@/types/habit"

const NOW = new Date(2026, 6, 15, 12, 0, 0) // Wed 15 Jul 2026, local

const ci = (y: number, m: number, d: number, amount = 1) => ({
  id: `${y}-${m}-${d}`,
  date: new Date(Date.UTC(y, m, d)),
  amount,
})

const mk = (o: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Read",
  icon: "📖",
  color: "primary",
  frequencyType: "daily",
  weekdays: [],
  weeklyTarget: 1,
  goalType: o.goalType ?? "achieve",
  targetAmount: o.targetAmount ?? 1,
  unit: o.unit ?? null,
  archived: false,
  checkIns: o.checkIns ?? [],
})

describe("HabitHeatmap", () => {
  it("renders weeks*7 day cells in week columns", () => {
    const { container } = render(<HabitHeatmap habit={mk()} weeks={4} now={NOW} />)
    expect(container.querySelectorAll(".flex.flex-col").length).toBe(4)
    expect(container.querySelectorAll(".w-3.h-3").length).toBe(28)
  })

  it("colors a satisfied day with the habit's fill", () => {
    const { container } = render(<HabitHeatmap habit={mk({ checkIns: [ci(2026, 6, 15)] })} weeks={4} now={NOW} />)
    expect(container.querySelector(".bg-primary-500")).toBeInTheDocument()
  })

  it("shows a partial shade for an amount day below target", () => {
    const h = mk({ goalType: "amount", targetAmount: 8, checkIns: [ci(2026, 6, 15, 3)] })
    const { container } = render(<HabitHeatmap habit={h} weeks={4} now={NOW} />)
    expect(container.querySelector(".bg-primary-200")).toBeInTheDocument()
    expect(container.querySelector(".bg-primary-500")).not.toBeInTheDocument()
  })
})
