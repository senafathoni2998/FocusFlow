import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockCreate = jest.fn().mockResolvedValue({ success: true })
const mockUpdate = jest.fn().mockResolvedValue({ success: true })
jest.mock("@/app/actions/habits", () => ({
  createHabit: (...a: any) => mockCreate(...a),
  updateHabit: (...a: any) => mockUpdate(...a),
}))

import HabitForm from "@/components/habits/HabitForm"

describe("HabitForm", () => {
  beforeEach(() => jest.clearAllMocks())

  it("creates a habit on submit", async () => {
    render(<HabitForm />)
    await userEvent.type(screen.getByLabelText("Name *"), "Meditate")
    await userEvent.click(screen.getByRole("button", { name: "Create Habit" }))
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Meditate", goalType: "achieve" }))
  })

  it("applies a preset", async () => {
    render(<HabitForm />)
    await userEvent.click(screen.getByRole("button", { name: /Drink water/ }))
    expect((screen.getByLabelText("Name *") as HTMLInputElement).value).toBe("Drink water")
  })

  it("shows target/unit fields for an amount goal", async () => {
    render(<HabitForm />)
    await userEvent.selectOptions(screen.getByLabelText("Goal"), "amount")
    expect(screen.getByLabelText("Target")).toBeInTheDocument()
    expect(screen.getByLabelText("Unit")).toBeInTheDocument()
  })
})
