import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Habit } from "@/types/habit"

jest.mock("@/components/habits/HabitHeatmap", () => {
  return function MockHeatmap() {
    return <div data-testid="heatmap" />
  }
})

import HabitDetail from "@/components/habits/HabitDetail"

const mk = (o: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: o.name ?? "Read",
  icon: "📖",
  color: "primary",
  frequencyType: o.frequencyType ?? "daily",
  weekdays: o.weekdays ?? [],
  weeklyTarget: o.weeklyTarget ?? 1,
  goalType: o.goalType ?? "achieve",
  targetAmount: o.targetAmount ?? 1,
  unit: o.unit ?? null,
  archived: false,
  checkIns: o.checkIns ?? [],
})

describe("HabitDetail", () => {
  it("renders the habit name, stat tiles, and heatmap", () => {
    render(<HabitDetail habit={mk({ name: "Read" })} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Read" })).toBeInTheDocument()
    expect(screen.getByText("Streak")).toBeInTheDocument()
    expect(screen.getByText("This month")).toBeInTheDocument()
    expect(screen.getByTestId("heatmap")).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    const onClose = jest.fn()
    render(<HabitDetail habit={mk()} onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })

  it("shows the weekly frequency and a week streak unit", () => {
    render(<HabitDetail habit={mk({ frequencyType: "weekly", weeklyTarget: 3 })} onClose={() => {}} />)
    expect(screen.getByText(/per week/)).toBeInTheDocument()
    // Streak + Best tiles carry the "w" (week) unit.
    expect(screen.getAllByText(/0w/).length).toBeGreaterThan(0)
  })

  it("shows specific weekdays in the subtitle", () => {
    render(<HabitDetail habit={mk({ weekdays: [1, 3, 5] })} onClose={() => {}} />)
    expect(screen.getByText(/Mo We Fr/)).toBeInTheDocument()
  })
})
