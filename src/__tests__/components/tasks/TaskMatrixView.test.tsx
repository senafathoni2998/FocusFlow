import { render, screen, within } from "@testing-library/react"
import type { Task } from "@/types/task"

jest.mock("@/components/tasks/TaskCard", () => {
  return function MockCard({ task }: any) {
    return <div data-testid="card">{task.title}</div>
  }
})

import TaskMatrixView from "@/components/tasks/TaskMatrixView"

const NOW = new Date(2026, 6, 15, 12) // Wed 15 Jul 2026
const today = new Date(2026, 6, 15)

const mk = (o: Partial<Task> = {}): Task =>
  ({
    id: o.id ?? Math.random().toString(),
    title: o.title ?? "Task",
    description: null,
    status: o.status ?? "todo",
    priority: o.priority ?? "medium",
    dueDate: o.dueDate ?? null,
    order: 0,
    listId: null,
    parentTaskId: null,
  }) as Task

const quadrant = (title: string) => screen.getByText(title).closest("section") as HTMLElement

describe("TaskMatrixView", () => {
  it("renders a skeleton until now is set", () => {
    render(<TaskMatrixView tasks={[]} now={null} />)
    expect(screen.queryByText("Do first")).not.toBeInTheDocument()
  })

  it("sorts tasks into the four Eisenhower quadrants", () => {
    const tasks = [
      mk({ title: "A-do-first", priority: "high", dueDate: today }), // urgent + important
      mk({ title: "B-schedule", priority: "high" }), // important, no date → not urgent
      mk({ title: "C-delegate", priority: "low", dueDate: today }), // urgent, not important
      mk({ title: "D-later", priority: "none" }), // neither
    ]
    render(<TaskMatrixView tasks={tasks} now={NOW} />)

    expect(within(quadrant("Do first")).getByText("A-do-first")).toBeInTheDocument()
    expect(within(quadrant("Schedule")).getByText("B-schedule")).toBeInTheDocument()
    expect(within(quadrant("Delegate")).getByText("C-delegate")).toBeInTheDocument()
    expect(within(quadrant("Later")).getByText("D-later")).toBeInTheDocument()
  })

  it("treats an overdue high-priority task as urgent+important", () => {
    const overdue = new Date(2026, 6, 1) // before today
    render(<TaskMatrixView tasks={[mk({ title: "Overdue", priority: "high", dueDate: overdue })]} now={NOW} />)
    expect(within(quadrant("Do first")).getByText("Overdue")).toBeInTheDocument()
  })

  it("honors the 2-day urgency threshold (boundary and beyond)", () => {
    const inDays = (n: number) => new Date(2026, 6, 15 + n)
    const tasks = [
      mk({ title: "Due-in-2", priority: "high", dueDate: inDays(2) }), // exactly 2 → urgent
      mk({ title: "Due-in-3", priority: "high", dueDate: inDays(3) }), // 3 → not urgent
      mk({ title: "Low-in-3", priority: "low", dueDate: inDays(3) }), // 3, low → later
    ]
    render(<TaskMatrixView tasks={tasks} now={NOW} />)
    // A dated high-priority task inside the window is "Do first"...
    expect(within(quadrant("Do first")).getByText("Due-in-2")).toBeInTheDocument()
    // ...but one just outside the window is important-not-urgent → "Schedule".
    expect(within(quadrant("Schedule")).getByText("Due-in-3")).toBeInTheDocument()
    // And a low-priority task outside the window is neither → "Later" (not Delegate).
    expect(within(quadrant("Later")).getByText("Low-in-3")).toBeInTheDocument()
    expect(within(quadrant("Delegate")).queryByText("Low-in-3")).not.toBeInTheDocument()
  })

  it("excludes terminal (completed/wont-do) tasks", () => {
    const tasks = [
      mk({ title: "Done", priority: "high", dueDate: today, status: "completed" }),
      mk({ title: "Dropped", priority: "high", dueDate: today, status: "wont-do" }),
    ]
    render(<TaskMatrixView tasks={tasks} now={NOW} />)
    expect(screen.queryByText("Done")).not.toBeInTheDocument()
    expect(screen.queryByText("Dropped")).not.toBeInTheDocument()
  })
})
