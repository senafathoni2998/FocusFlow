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
  getArchivedGoals: jest.fn().mockResolvedValue([]),
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
jest.mock("@/components/goals/GoalDetail", () => {
  return function MockDetail({ goal, onClose }: any) {
    return (
      <div data-testid="goal-detail" data-goal-id={goal?.id}>
        <button onClick={onClose}>Close detail</button>
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
    expect(screen.getByText(/No active goals/)).toBeInTheDocument()
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

  it("archiving a goal calls setGoalStatus(archived)", async () => {
    const { setGoalStatus } = require("@/app/actions/goals")
    render(<GoalBoard goals={[mkGoal({ id: "g1", title: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Archive" }))
    expect(setGoalStatus).toHaveBeenCalledWith("g1", "archived")
  })

  it("Show archived fetches and lists archived goals with Restore", async () => {
    const { getArchivedGoals } = require("@/app/actions/goals")
    getArchivedGoals.mockResolvedValueOnce([mkGoal({ id: "a1", title: "Old goal", status: "archived" })])
    render(<GoalBoard goals={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "Show archived" }))
    expect(await screen.findByText("Old goal")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument()
  })

  it("clicking a goal title opens its detail panel", async () => {
    render(<GoalBoard goals={[mkGoal({ id: "g1", title: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Read" }))
    const detail = screen.getByTestId("goal-detail")
    expect(detail).toBeInTheDocument()
    expect(detail.getAttribute("data-goal-id")).toBe("g1")
  })

  it("restoring an archived goal calls setGoalStatus(active)", async () => {
    const { getArchivedGoals, setGoalStatus } = require("@/app/actions/goals")
    getArchivedGoals.mockResolvedValueOnce([mkGoal({ id: "a1", title: "Old goal", status: "archived" })])
    render(<GoalBoard goals={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "Show archived" }))
    await screen.findByText("Old goal")
    await userEvent.click(screen.getByRole("button", { name: "Restore" }))
    expect(setGoalStatus).toHaveBeenCalledWith("a1", "active")
  })
})
