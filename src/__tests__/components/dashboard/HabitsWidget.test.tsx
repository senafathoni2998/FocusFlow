import { render, screen } from "@testing-library/react"
import HabitsWidget from "@/components/dashboard/HabitsWidget"
import type { Habit } from "@/types/habit"

jest.mock("next/link", () => {
  return function MockLink({ href, children }: any) {
    return <a href={href}>{children}</a>
  }
})

const mk = (o: Partial<Habit> = {}): Habit => ({
  id: o.id ?? "h1",
  name: o.name ?? "Read",
  icon: "📖",
  color: "primary",
  frequencyType: "daily",
  weekdays: [],
  weeklyTarget: 1,
  goalType: "achieve",
  targetAmount: 1,
  unit: null,
  archived: false,
  checkIns: o.checkIns ?? [],
})

describe("HabitsWidget", () => {
  it("shows an empty state with no habits", () => {
    render(<HabitsWidget habits={[]} />)
    expect(screen.getByText(/No habits yet/)).toBeInTheDocument()
  })

  it("renders the active habits", () => {
    render(<HabitsWidget habits={[mk({ id: "h1", name: "Read" }), mk({ id: "h2", name: "Run" })]} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
  })

  it("links to the habits page", () => {
    render(<HabitsWidget habits={[mk()]} />)
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/habits")
  })
})
