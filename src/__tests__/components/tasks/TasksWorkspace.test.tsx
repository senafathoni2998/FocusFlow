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
jest.mock("@/app/actions/tasks", () => ({
  reorderTask: jest.fn(),
  completeTask: jest.fn().mockResolvedValue({ success: true }),
}))
jest.mock("@/app/actions/lists", () => ({
  createList: jest.fn().mockResolvedValue({ success: true }),
  deleteList: jest.fn().mockResolvedValue({ success: true }),
  getLists: jest.fn().mockResolvedValue([]),
}))
jest.mock("@/app/actions/tags", () => ({
  deleteTag: jest.fn().mockResolvedValue({ success: true }),
}))

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
    listId: o.listId ?? null,
    parentTaskId: o.parentTaskId ?? null,
  } as Task)

const tasks: Task[] = [
  mk("today", { dueDate: new Date() }),
  mk("open2", { status: "in-progress", dueDate: null }),
  mk("done", { status: "completed", dueDate: null }),
]

const testLists = [
  { id: "l1", name: "Work" },
  { id: "l2", name: "Home" },
]

const testTags = [{ id: "t1", name: "work" }]

describe("TasksWorkspace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearch = ""
  })

  it("renders the header and New Task button", () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ New Task" })).toBeInTheDocument()
  })

  it("renders the smart-list sidebar with date horizons", () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByRole("button", { name: /Today/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /This Month/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Next Year/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /No Date/ })).toBeInTheDocument()
  })

  it("shows the board view by default", () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("board")).toBeInTheDocument()
    expect(screen.queryByTestId("list")).not.toBeInTheDocument()
  })

  it("selecting a horizon writes ?horizon to the URL", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: /This Month/ }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("horizon=thisMonth"), expect.anything())
  })

  it("switching to the list view writes ?view=list", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: "list" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("view=list"), expect.anything())
  })

  it("renders the list view when ?view=list", () => {
    mockSearch = "view=list"
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("list")).toBeInTheDocument()
    expect(screen.queryByTestId("board")).not.toBeInTheDocument()
  })

  it("toggling a status pill writes ?status", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: "To Do" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("status=todo"), expect.anything())
  })

  it("typing in search writes ?q", async () => {
    // The search input is URL-controlled; with a static useSearchParams mock it
    // resets each keystroke, so assert on a single character (still exercises
    // the query → URL wiring deterministically).
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.type(screen.getByLabelText("Search tasks"), "a")
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("q=a"), expect.anything())
  })

  it("opens the create-task modal from the New Task button", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: "+ New Task" }))
    expect(screen.getByTestId("create-form")).toBeInTheDocument()
  })

  it("filters by horizon before handing tasks to the view (No Date → 2)", () => {
    mockSearch = "horizon=noDate"
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("board")).toHaveAttribute("data-count", "2")
  })

  it("renders the Lists section with Inbox and custom lists", () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByRole("button", { name: /Inbox/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument()
  })

  it("selecting a list writes ?list=<id>", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: "Work" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("list=l1"), expect.anything())
  })

  it("clicking Inbox writes ?list=inbox", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: /Inbox/ }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("list=inbox"), expect.anything())
  })

  it("filters tasks to the selected list", () => {
    mockSearch = "list=l1"
    render(<TasksWorkspace tasks={[mk("w", { listId: "l1" }), mk("i", {})]} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("board")).toHaveAttribute("data-count", "1")
  })

  it("excludes subtasks (parentTaskId set) from the top-level views", () => {
    render(<TasksWorkspace tasks={[mk("p"), mk("s", { parentTaskId: "p" })]} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("board")).toHaveAttribute("data-count", "1")
  })

  it("renders tag filter chips from allTags", () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    expect(screen.getByRole("button", { name: "#work" })).toBeInTheDocument()
  })

  it("selecting a tag writes ?tags", async () => {
    render(<TasksWorkspace tasks={tasks} lists={testLists} allTags={testTags} />)
    await userEvent.click(screen.getByRole("button", { name: "#work" }))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("tags=t1"), expect.anything())
  })

  it("filters tasks by tag", () => {
    mockSearch = "tags=t1"
    const tagged = { ...mk("a"), tags: [{ id: "t1", name: "work" }] } as any
    render(<TasksWorkspace tasks={[tagged, mk("b")]} lists={testLists} allTags={testTags} />)
    expect(screen.getByTestId("board")).toHaveAttribute("data-count", "1")
  })
})
