/**
 * Unit tests for TasksWorkspace — the container that owns filter/view state
 * (mirrored to the URL), the smart-list sidebar, the filter bar, and the create
 * modal. Child views are stubbed so these focus on wiring and horizon filtering.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockReplace = jest.fn()
const mockRefresh = jest.fn()
let mockSearch = ""

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh, push: jest.fn() }),
  usePathname: () => "/tasks",
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

jest.mock("@/hooks/useTaskUpdates", () => ({ useTaskUpdates: jest.fn() }))
jest.mock("@/app/actions/tasks", () => ({ reorderTask: jest.fn() }))

jest.mock("@/components/tasks/TaskBoard", () => {
  return function MockBoard({ tasks }: any) {
    return <div data-testid="board" data-count={tasks.length}>Board</div>
  }
})
jest.mock("@/components/tasks/TaskListView", () => {
  return function MockList({ tasks }: any) {
    return <div data-testid="list" data-count={tasks.length}>List</div>
  }
})
jest.mock("@/components/tasks/CreateTaskForm", () => {
  return function MockCreate({ onClose }: any) {
    return (
      <div data-testid="create-form">
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})

import TasksWorkspace from "@/components/tasks/TasksWorkspace"
import type { Task } from "@/types/task"

const mk = (id: string, o: Partial<Task> = {}): Task =>
  ({
    id,
    title: id,
    description: null,
    status: o.status ?? "todo",
    priority: o.priority ?? "medium",
    dueDate: o.dueDate ?? null,
    order: o.order ?? 0,
  } as Task)

const tasks: Task[] = [
  mk("today", { dueDate: new Date() }),
  mk("open2", { status: "in-progress", dueDate: null }),
  mk("done", { status: "completed", dueDate: null }),
]

describe("TasksWorkspace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearch = ""
  })

  it("renders the header and New Task button", () => {
    render(<TasksWorkspace tasks={tasks} />)
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ New Task" })).toBeInTheDocument()
  })

  it("renders the smart-list sidebar with date horizons", () => {
    render(<TasksWorkspace tasks={tasks} />)
    expect(screen.getByRole("button", { name: /Today/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /This Month/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Next Year/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /No Date/ })).toBeInTheDocument()
  })

  it("shows the board view by default", () => {
    render(<TasksWorkspace tasks={tasks} />)
    expect(screen.getByTestId("board")).toBeInTheDocument()
    expect(screen.queryByTestId("list")).not.toBeInTheDocument()
  })

  it("selecting a horizon writes ?horizon to the URL", async () => {
    render(<TasksWorkspace tasks={tasks} />)
    await userEvent.click(screen.getByRole("button", { name: /This Month/ }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("horizon=thisMonth"), expect.anything())
  })

  it("switching to the list view writes ?view=list", async () => {
    render(<TasksWorkspace tasks={tasks} />)
    await userEvent.click(screen.getByRole("button", { name: "list" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("view=list"), expect.anything())
  })

  it("renders the list view when ?view=list", () => {
    mockSearch = "view=list"
    render(<TasksWorkspace tasks={tasks} />)
    expect(screen.getByTestId("list")).toBeInTheDocument()
    expect(screen.queryByTestId("board")).not.toBeInTheDocument()
  })

  it("toggling a status pill writes ?status", async () => {
    render(<TasksWorkspace tasks={tasks} />)
    await userEvent.click(screen.getByRole("button", { name: "To Do" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("status=todo"), expect.anything())
  })

  it("typing in search writes ?q", async () => {
    // The search input is URL-controlled; with a static useSearchParams mock it
    // resets each keystroke, so assert on a single character (still exercises
    // the query → URL wiring deterministically).
    render(<TasksWorkspace tasks={tasks} />)
    await userEvent.type(screen.getByLabelText("Search tasks"), "a")
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("q=a"), expect.anything())
  })

  it("opens the create-task modal from the New Task button", async () => {
    render(<TasksWorkspace tasks={tasks} />)
    await userEvent.click(screen.getByRole("button", { name: "+ New Task" }))
    expect(screen.getByTestId("create-form")).toBeInTheDocument()
  })

  it("filters by horizon before handing tasks to the view (No Date → 2)", () => {
    mockSearch = "horizon=noDate"
    render(<TasksWorkspace tasks={tasks} />)
    expect(screen.getByTestId("board")).toHaveAttribute("data-count", "2")
  })
})
