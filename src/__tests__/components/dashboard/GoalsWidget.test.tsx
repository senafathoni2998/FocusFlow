import { render, screen } from "@testing-library/react"
import GoalsWidget from "@/components/dashboard/GoalsWidget"
import type { Goal } from "@/types/goal"

jest.mock("next/link", () => {
  return function MockLink({ href, children }: any) {
    return <a href={href}>{children}</a>
  }
})

const mk = (o: Partial<Goal> = {}): Goal => ({
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

describe("GoalsWidget", () => {
  it("shows an empty state with no active goals", () => {
    render(<GoalsWidget goals={[]} />)
    expect(screen.getByText(/No active goals/)).toBeInTheDocument()
  })

  it("renders active goals with their percent", () => {
    render(<GoalsWidget goals={[mk({ id: "g1", title: "Read", manualProgress: 40 })]} />)
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("omits achieved goals from the active list", () => {
    render(<GoalsWidget goals={[mk({ id: "g1", title: "Done", status: "achieved" })]} />)
    expect(screen.queryByText("Done")).not.toBeInTheDocument()
    expect(screen.getByText(/No active goals/)).toBeInTheDocument()
  })

  it("links to the goals page", () => {
    render(<GoalsWidget goals={[mk()]} />)
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/goals")
  })
})
