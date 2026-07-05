import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockCreate = jest.fn().mockResolvedValue({ success: true })
const mockUpdate = jest.fn().mockResolvedValue({ success: true })
jest.mock("@/app/actions/habits", () => ({
  createHabit: (...a: any) => mockCreate(...a),
  updateHabit: (...a: any) => mockUpdate(...a),
}))

import HabitForm from "@/components/habits/HabitForm"
import type { Habit } from "@/types/habit"

const mkHabit = (o: Partial<Habit> = {}): Habit => ({
  id: o.id ?? "hw",
  name: o.name ?? "Exercise",
  icon: "🏃",
  color: "warning",
  frequencyType: o.frequencyType ?? "daily",
  weekdays: o.weekdays ?? [],
  weeklyTarget: o.weeklyTarget ?? 1,
  goalType: "achieve",
  targetAmount: 1,
  unit: null,
  archived: false,
  checkIns: [],
})

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

  it("defaults to a daily frequency", async () => {
    render(<HabitForm />)
    await userEvent.type(screen.getByLabelText("Name *"), "Read")
    await userEvent.click(screen.getByRole("button", { name: "Create Habit" }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ frequencyType: "daily", weekdays: [], weeklyTarget: 1 })
    )
  })

  it("saves a weekly target", async () => {
    render(<HabitForm />)
    await userEvent.type(screen.getByLabelText("Name *"), "Exercise")
    await userEvent.selectOptions(screen.getByLabelText("Frequency"), "weekly")
    const target = screen.getByLabelText("Times per week")
    await userEvent.clear(target)
    await userEvent.type(target, "4")
    await userEvent.click(screen.getByRole("button", { name: "Create Habit" }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ frequencyType: "weekly", weeklyTarget: 4 })
    )
  })

  it("saves specific weekdays as a daily habit with a weekday allow-list", async () => {
    render(<HabitForm />)
    await userEvent.type(screen.getByLabelText("Name *"), "Gym")
    await userEvent.selectOptions(screen.getByLabelText("Frequency"), "weekdays")
    await userEvent.click(screen.getByRole("button", { name: "Mo" }))
    await userEvent.click(screen.getByRole("button", { name: "We" }))
    await userEvent.click(screen.getByRole("button", { name: "Create Habit" }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ frequencyType: "daily", weekdays: [1, 3] })
    )
  })

  it("requires at least one weekday in specific-days mode", async () => {
    render(<HabitForm />)
    await userEvent.type(screen.getByLabelText("Name *"), "Gym")
    await userEvent.selectOptions(screen.getByLabelText("Frequency"), "weekdays")
    await userEvent.click(screen.getByRole("button", { name: "Create Habit" }))
    expect(screen.getByText(/Pick at least one day/i)).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("initializes the frequency mode from an edited habit", () => {
    render(<HabitForm habit={mkHabit({ frequencyType: "daily", weekdays: [1, 3] })} />)
    // Specific-days mode with Mon+Wed pre-selected.
    expect((screen.getByLabelText("Frequency") as HTMLSelectElement).value).toBe("weekdays")
    expect(screen.getByRole("button", { name: "Mo" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "We" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Tu" })).toHaveAttribute("aria-pressed", "false")
  })

  it("clears weekly fields when an edited habit switches to daily", async () => {
    render(<HabitForm habit={mkHabit({ frequencyType: "weekly", weeklyTarget: 4 })} />)
    expect((screen.getByLabelText("Frequency") as HTMLSelectElement).value).toBe("weekly")
    await userEvent.selectOptions(screen.getByLabelText("Frequency"), "daily")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(mockUpdate).toHaveBeenCalledWith(
      "hw",
      expect.objectContaining({ frequencyType: "daily", weekdays: [], weeklyTarget: 1 })
    )
  })
})
