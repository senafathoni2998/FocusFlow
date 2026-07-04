import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
}))
jest.mock("@/app/actions/habits", () => ({
  checkInHabit: jest.fn().mockResolvedValue({ success: true }),
  deleteHabit: jest.fn().mockResolvedValue({ success: true }),
}))
jest.mock("@/components/habits/HabitForm", () => {
  return function MockForm({ onClose }: any) {
    return (
      <div data-testid="habit-form">
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})
jest.mock("@/components/habits/HabitDetail", () => {
  return function MockDetail({ habit, onClose }: any) {
    return (
      <div data-testid="habit-detail" data-habit-id={habit?.id}>
        <button onClick={onClose}>Close detail</button>
      </div>
    )
  }
})

import HabitBoard from "@/components/habits/HabitBoard"
import type { Habit } from "@/types/habit"

const mkHabit = (o: Partial<Habit> = {}): Habit => ({
  id: o.id ?? "h1",
  name: o.name ?? "Read",
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

describe("HabitBoard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.confirm = jest.fn(() => true) as any
  })

  it("renders the header and New Habit button", () => {
    render(<HabitBoard habits={[]} />)
    expect(screen.getByRole("heading", { name: "Habits" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ New Habit" })).toBeInTheDocument()
  })

  it("shows an empty state with no habits", () => {
    render(<HabitBoard habits={[]} />)
    expect(screen.getByText(/No habits yet/)).toBeInTheDocument()
  })

  it("renders a row per habit", () => {
    render(<HabitBoard habits={[mkHabit({ id: "h1", name: "Read" }), mkHabit({ id: "h2", name: "Run" })]} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
  })

  it("checking in an achieve habit calls checkInHabit(+1)", async () => {
    const { checkInHabit } = require("@/app/actions/habits")
    render(<HabitBoard habits={[mkHabit({ id: "h1", name: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Mark done today" }))
    expect(checkInHabit).toHaveBeenCalledWith(expect.objectContaining({ habitId: "h1", delta: 1 }))
  })

  it("deleting a habit calls deleteHabit", async () => {
    const { deleteHabit } = require("@/app/actions/habits")
    render(<HabitBoard habits={[mkHabit({ id: "h1", name: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(deleteHabit).toHaveBeenCalledWith("h1")
  })

  it("opens the create form", async () => {
    render(<HabitBoard habits={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "+ New Habit" }))
    expect(screen.getByTestId("habit-form")).toBeInTheDocument()
  })

  it("clicking a habit name opens its detail panel", async () => {
    render(<HabitBoard habits={[mkHabit({ id: "h1", name: "Read" })]} />)
    await userEvent.click(screen.getByRole("button", { name: "Read" }))
    const detail = screen.getByTestId("habit-detail")
    expect(detail).toBeInTheDocument()
    expect(detail.getAttribute("data-habit-id")).toBe("h1")
  })
})
