import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockCreate = jest.fn().mockResolvedValue({ success: true })
const mockUpdate = jest.fn().mockResolvedValue({ success: true })
jest.mock("@/app/actions/goals", () => ({
  createGoal: (...a: any) => mockCreate(...a),
  updateGoal: (...a: any) => mockUpdate(...a),
}))

import GoalForm from "@/components/goals/GoalForm"

describe("GoalForm", () => {
  beforeEach(() => jest.clearAllMocks())

  it("creates a goal on submit", async () => {
    render(<GoalForm />)
    await userEvent.type(screen.getByLabelText("Title *"), "Read 12 books")
    await userEvent.click(screen.getByRole("button", { name: "Create Goal" }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Read 12 books", progressType: "manual" })
    )
  })

  it("shows target/unit fields for a numeric goal", async () => {
    render(<GoalForm />)
    await userEvent.selectOptions(screen.getByLabelText("Progress"), "numeric")
    expect(screen.getByLabelText("Target")).toBeInTheDocument()
    expect(screen.getByLabelText("Unit")).toBeInTheDocument()
  })

  it("blocks submit when a numeric target is empty (no silent reset to 1)", async () => {
    render(<GoalForm />)
    await userEvent.type(screen.getByLabelText("Title *"), "Ship v1")
    await userEvent.selectOptions(screen.getByLabelText("Progress"), "numeric")
    await userEvent.clear(screen.getByLabelText("Target"))
    await userEvent.click(screen.getByRole("button", { name: "Create Goal" }))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText(/target greater than 0/i)).toBeInTheDocument()
  })

  it("clears the description with null when emptied on edit", async () => {
    const goal = {
      id: "g1",
      title: "T",
      icon: "🎯",
      color: "primary",
      progressType: "manual",
      targetValue: null,
      currentValue: 0,
      unit: null,
      manualProgress: 0,
      targetDate: null,
      status: "active",
      description: "old notes",
    }
    render(<GoalForm goal={goal as any} />)
    await userEvent.clear(screen.getByLabelText("Notes"))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(mockUpdate).toHaveBeenCalledWith("g1", expect.objectContaining({ description: null }))
  })
})
