import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import GoalCard from "@/components/goals/GoalCard"
import type { Goal } from "@/types/goal"

const mk = (o: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: o.title ?? "Read",
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

const noop = () => {}
const handlers = { onAdjust: noop, onSetStatus: noop, onEdit: noop, onDelete: noop }

describe("GoalCard", () => {
  it("renders the title and manual percent", () => {
    render(<GoalCard goal={mk({ title: "Read", manualProgress: 40 })} {...handlers} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("increase steps a manual goal by +10", async () => {
    const onAdjust = jest.fn()
    render(<GoalCard goal={mk()} {...handlers} onAdjust={onAdjust} />)
    await userEvent.click(screen.getByRole("button", { name: "Increase progress" }))
    expect(onAdjust).toHaveBeenCalledWith(10)
  })

  it("a numeric goal shows current/target and steps by 1", async () => {
    const onAdjust = jest.fn()
    render(
      <GoalCard goal={mk({ progressType: "numeric", currentValue: 3, targetValue: 12, unit: "books" })} {...handlers} onAdjust={onAdjust} />
    )
    expect(screen.getByText(/3\/12 books/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Increase progress" }))
    expect(onAdjust).toHaveBeenCalledWith(1)
  })

  it("the achieve toggle marks the goal achieved", async () => {
    const onSetStatus = jest.fn()
    render(<GoalCard goal={mk()} {...handlers} onSetStatus={onSetStatus} />)
    await userEvent.click(screen.getByRole("button", { name: "Mark achieved" }))
    expect(onSetStatus).toHaveBeenCalledWith("achieved")
  })

  it("the Archive button archives the goal", async () => {
    const onSetStatus = jest.fn()
    render(<GoalCard goal={mk()} {...handlers} onSetStatus={onSetStatus} />)
    await userEvent.click(screen.getByRole("button", { name: "Archive" }))
    expect(onSetStatus).toHaveBeenCalledWith("archived")
  })

  it("an achieved goal shows the badge and can be reactivated", async () => {
    const onSetStatus = jest.fn()
    render(<GoalCard goal={mk({ status: "achieved" })} {...handlers} onSetStatus={onSetStatus} />)
    expect(screen.getByText("✓ Achieved")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Reactivate" }))
    expect(onSetStatus).toHaveBeenCalledWith("active")
  })

  it("a tasks-progress goal shows X/Y tasks and hides the manual +/- buttons", () => {
    render(
      <GoalCard goal={mk({ progressType: "tasks", taskCompleted: 2, taskTotal: 5 })} {...handlers} />
    )
    expect(screen.getByText(/2\/5 tasks/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Increase progress" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Decrease progress" })).not.toBeInTheDocument()
    // the achieve toggle is still available
    expect(screen.getByRole("button", { name: "Mark achieved" })).toBeInTheDocument()
  })
})
