import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Task } from "@/types/task"

jest.mock("@/components/tasks/EditTaskForm", () => {
  return function MockEdit({ task, onClose }: any) {
    return (
      <div data-testid="edit-form">
        Editing {task.title}
        <button onClick={onClose}>close</button>
      </div>
    )
  }
})

import TaskCalendarView from "@/components/tasks/TaskCalendarView"

const NOW = new Date(2026, 6, 15, 12) // Wed 15 Jul 2026 (July: starts Wed, 5 rows)

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

const cellFor = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-date="${key}"]`) as HTMLElement

describe("TaskCalendarView", () => {
  it("renders a skeleton until now is set (no month shown)", () => {
    render(<TaskCalendarView tasks={[]} now={null} />)
    expect(screen.queryByText(/July 2026/)).not.toBeInTheDocument()
  })

  it("places a dated task in its own day cell (and nowhere else)", async () => {
    const tasks = [mk({ id: "a", title: "Meeting", dueDate: new Date(2026, 6, 20) })]
    const { container } = render(<TaskCalendarView tasks={tasks} now={NOW} />)
    await screen.findByText("July 2026")
    expect(within(cellFor(container, "2026-07-20")).getByText("Meeting")).toBeInTheDocument()
    // Not present in any other day cell.
    expect(within(cellFor(container, "2026-07-19")).queryByText("Meeting")).not.toBeInTheDocument()
  })

  it("counts undated tasks in a footer and doesn't place them", async () => {
    const tasks = [mk({ id: "a", title: "Someday" })]
    render(<TaskCalendarView tasks={tasks} now={NOW} />)
    expect(await screen.findByText(/1 task with no due date/)).toBeInTheDocument()
    expect(screen.queryByText("Someday")).not.toBeInTheDocument()
  })

  it("keeps open tasks in the visible chip slots ahead of completed ones", async () => {
    const day = new Date(2026, 6, 20)
    const tasks = [
      mk({ id: "c1", title: "Done1", status: "completed", dueDate: day }),
      mk({ id: "c2", title: "Done2", status: "completed", dueDate: day }),
      mk({ id: "c3", title: "Done3", status: "completed", dueDate: day }),
      mk({ id: "o1", title: "OpenTask", status: "todo", dueDate: day }),
    ]
    const { container } = render(<TaskCalendarView tasks={tasks} now={NOW} />)
    await screen.findByText("July 2026")
    // The open task is not hidden behind the completed ones in the 3 visible slots.
    expect(within(cellFor(container, "2026-07-20")).getByText("OpenTask")).toBeInTheDocument()
    expect(within(cellFor(container, "2026-07-20")).getByText(/\+1 more/)).toBeInTheDocument()
  })

  it("caps chips at 3 and opens a day detail from '+N more'", async () => {
    const day = new Date(2026, 6, 20)
    const tasks = Array.from({ length: 5 }, (_, i) =>
      mk({ id: `t${i}`, title: `Task${i}`, dueDate: day })
    )
    const { container } = render(<TaskCalendarView tasks={tasks} now={NOW} />)
    await screen.findByText("July 2026")
    const cell = cellFor(container, "2026-07-20")
    // Only the first 3 show as chips; the 4th/5th are hidden behind "+2 more".
    expect(within(cell).getByText(/\+2 more/)).toBeInTheDocument()
    expect(screen.queryByText("Task3")).not.toBeInTheDocument()
    expect(screen.queryByText("Task4")).not.toBeInTheDocument()
    // Opening the day detail reveals the hidden ones.
    await userEvent.click(within(cell).getByText(/\+2 more/))
    expect(screen.getByText("Task3")).toBeInTheDocument()
    expect(screen.getByText("Task4")).toBeInTheDocument()
  })

  it("navigates months with prev/next and back to Today", async () => {
    render(<TaskCalendarView tasks={[]} now={NOW} />)
    await screen.findByText("July 2026")
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }))
    expect(screen.getByText("June 2026")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Next month" }))
    await userEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(screen.getByText("August 2026")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByText("July 2026")).toBeInTheDocument()
  })

  it("renders a 6-row grid for a month that needs it (Aug 2026 starts Saturday)", async () => {
    const { container } = render(<TaskCalendarView tasks={[]} now={new Date(2026, 7, 15)} />)
    await screen.findByText("August 2026")
    expect(container.querySelectorAll("[data-date]")).toHaveLength(42) // 6 rows
    // First cell is the Sunday of Aug 1's week → July 26 (previous month).
    expect(cellFor(container, "2026-07-26")).toBeTruthy()
  })

  it("renders a 5-row grid with no leading cells for a Sunday-starting month (Nov 2026)", async () => {
    const { container } = render(<TaskCalendarView tasks={[]} now={new Date(2026, 10, 15)} />)
    await screen.findByText("November 2026")
    const cells = container.querySelectorAll("[data-date]")
    expect(cells).toHaveLength(35) // 5 rows
    expect(cells[0].getAttribute("data-date")).toBe("2026-11-01") // no leading previous-month days
  })

  it("opens the edit form when a task chip is clicked", async () => {
    const tasks = [mk({ id: "a", title: "Meeting", dueDate: new Date(2026, 6, 20) })]
    render(<TaskCalendarView tasks={tasks} now={NOW} />)
    await userEvent.click(await screen.findByText("Meeting"))
    expect(screen.getByTestId("edit-form")).toHaveTextContent("Editing Meeting")
  })
})
