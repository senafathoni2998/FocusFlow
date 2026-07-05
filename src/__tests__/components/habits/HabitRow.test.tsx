import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import HabitRow from "@/components/habits/HabitRow"
import type { Habit } from "@/types/habit"

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

const noop = () => {}

describe("HabitRow", () => {
  it("renders the name and streak", () => {
    render(<HabitRow habit={mk({ name: "Read" })} onCheckIn={noop} onEdit={noop} onDelete={noop} onOpenDetail={noop} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText(/0d/)).toBeInTheDocument()
  })

  it("achieve: toggle calls onCheckIn(+1) when not done", async () => {
    const onCheckIn = jest.fn()
    render(<HabitRow habit={mk()} onCheckIn={onCheckIn} onEdit={noop} onDelete={noop} onOpenDetail={noop} />)
    await userEvent.click(screen.getByRole("button", { name: "Mark done today" }))
    expect(onCheckIn).toHaveBeenCalledWith(1)
  })

  it("amount: shows progress and the + button calls onCheckIn(+1)", async () => {
    const onCheckIn = jest.fn()
    render(
      <HabitRow habit={mk({ goalType: "amount", targetAmount: 8, unit: "cups" })} onCheckIn={onCheckIn} onEdit={noop} onDelete={noop} onOpenDetail={noop} />
    )
    expect(screen.getByText(/0\/8 cups/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Increase" }))
    expect(onCheckIn).toHaveBeenCalledWith(1)
  })

  it("clicking the name opens the detail panel", async () => {
    const onOpenDetail = jest.fn()
    render(<HabitRow habit={mk({ name: "Read" })} onCheckIn={noop} onEdit={noop} onDelete={noop} onOpenDetail={onOpenDetail} />)
    await userEvent.click(screen.getByRole("button", { name: "Read" }))
    expect(onOpenDetail).toHaveBeenCalled()
  })

  it("weekly: shows a week streak unit and this-week progress", () => {
    render(
      <HabitRow
        habit={mk({ frequencyType: "weekly", weeklyTarget: 3 })}
        onCheckIn={noop}
        onEdit={noop}
        onDelete={noop}
        onOpenDetail={noop}
      />
    )
    expect(screen.getByText(/0w/)).toBeInTheDocument()
    expect(screen.getByText(/0\/3 this week/)).toBeInTheDocument()
  })
})
