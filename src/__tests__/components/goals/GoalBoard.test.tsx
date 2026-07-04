import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
}))
jest.mock("@/app/actions/goals", () => ({
  adjustGoalProgress: jest.fn().mockResolvedValue({ success: true }),
  setGoalStatus: jest.fn().mockResolvedValue({ success: true }),
  deleteGoal: jest.fn().mockResolvedValue({ success: true }),
}))
jest.mock("@/components/goals/GoalForm", () => {
  return function MockForm({ onClose }: any) {
    return (
      <div data-testid="goal-form">
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})

import GoalBoard from "@/components/goals/GoalBoard"
import type { Goal } from "@/types/goal"

const mkGoal = (o: Partial<Goal> = {}): Goal => ({
  id: o.id ?? "g1",
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
})

describe("GoalBoard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.confirm = jest.fn(() => true) as any
  })

  it("renders the header and New Goal button", () => {
    render(<GoalBoard goals={[]} />)
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ New Goal" })).toBeInTheDocument()
  })

  it("shows an empty state with no goals", () => {
    render(<GoalBoard goals={[]} />)
    expect(screen.getByText(/No goals yet/)).toBeInTheDocument()
  })

  it("renders a card per goal", () => {
    render(<GoalBoard goals={[mkGoal({ id: "g1", title: "Read" }), mkGoal({ id: "g2", title: "Run" })]} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
  })

  it("adjusting progress calls adjustGoalProgress(+10)", async () => {
    const { adjustGoalProgress } = require("@/app/actions/goals")
    render(<GoalBoard goals={[mkGoal({ id: "g1" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Increase progress" }))
    expect(adjustGoalProgress).toHaveBeenCalledWith("g1", 10)
  })

  it("deleting a goal calls deleteGoal", async () => {
    const { deleteGoal } = require("@/app/actions/goals")
    render(<GoalBoard goals={[mkGoal({ id: "g1", title: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(deleteGoal).toHaveBeenCalledWith("g1")
  })

  it("groups achieved goals under an Achieved section", () => {
    render(<GoalBoard goals={[mkGoal({ id: "g1", status: "achieved", title: "Done thing" })]} />)
    expect(screen.getByRole("heading", { name: "Achieved" })).toBeInTheDocument()
    expect(screen.getByText("Done thing")).toBeInTheDocument()
  })

  it("opens the create form", async () => {
    render(<GoalBoard goals={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "+ New Goal" }))
    expect(screen.getByTestId("goal-form")).toBeInTheDocument()
  })
})
