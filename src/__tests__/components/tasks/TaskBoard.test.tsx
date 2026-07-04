/**
 * Unit tests for the controlled TaskBoard (src/components/tasks/TaskBoard.tsx).
 *
 * Header, filters, search, create modal, and refresh now live in
 * TasksWorkspace and are covered by TasksWorkspace.test.tsx. This suite covers
 * the board's own job: laying the tasks it is given into the three status
 * columns and reporting reorders up via onReorder.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TaskBoard from "@/components/tasks/TaskBoard"

// dnd-kit mocked to pass-through wrappers (drag isn't exercised in jsdom).
jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  DragEndEvent: jest.fn(),
  DragStartEvent: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
  closestCorners: jest.fn(),
}))

jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: jest.fn(),
}))

jest.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }))

jest.mock("@/components/tasks/TaskCard", () => {
  return function MockTaskCard({ task, onUpdate }: any) {
    return (
      <div data-testid={`task-card-${task.id}`} data-status={task.status}>
        <span>{task.title}</span>
        <button onClick={onUpdate}>Update</button>
      </div>
    )
  }
})

const mockTasks = [
  { id: "task-1", title: "Todo Task", status: "todo", priority: "high", dueDate: new Date("2024-12-31"), order: 10 },
  { id: "task-2", title: "In Progress Task", status: "in-progress", priority: "medium", dueDate: new Date("2024-12-25"), order: 10 },
  { id: "task-3", title: "Completed Task", status: "completed", priority: "low", dueDate: new Date("2024-12-20"), order: 10 },
]

const renderBoard = (props: any = {}) =>
  render(<TaskBoard tasks={mockTasks} onReorder={jest.fn()} {...props} />)

describe("TaskBoard (controlled)", () => {
  beforeEach(() => jest.clearAllMocks())

  describe("Rendering", () => {
    it("renders the DndContext and DragOverlay", () => {
      renderBoard()
      expect(screen.getByTestId("dnd-context")).toBeInTheDocument()
      expect(screen.getByTestId("drag-overlay")).toBeInTheDocument()
    })

    it("renders the three status column headers", () => {
      renderBoard()
      expect(screen.getByText("To Do")).toBeInTheDocument()
      expect(screen.getByText("In Progress")).toBeInTheDocument()
      expect(screen.getByText("Completed")).toBeInTheDocument()
    })

    it("renders the column containers with their styling", () => {
      const { container } = renderBoard()
      expect(container.querySelector(".bg-gray-50.rounded-lg.p-4")).toBeInTheDocument()
      expect(container.querySelector(".bg-primary-50.rounded-lg.p-4")).toBeInTheDocument()
      expect(container.querySelector(".bg-success-50.rounded-lg.p-4")).toBeInTheDocument()
    })

    it("uses a responsive grid layout", () => {
      const { container } = renderBoard()
      const grid = container.querySelector(".grid.grid-cols-1")
      expect(grid).toBeInTheDocument()
      expect(grid).toHaveClass("md:grid-cols-3")
    })

    it("does not render a page header or filters (those live in the workspace)", () => {
      renderBoard()
      expect(screen.queryByRole("button", { name: "+ New Task" })).not.toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "Tasks" })).not.toBeInTheDocument()
    })
  })

  describe("Task placement", () => {
    it("places each task in its status column", () => {
      renderBoard()
      expect(screen.getByTestId("task-card-task-1")).toHaveAttribute("data-status", "todo")
      expect(screen.getByTestId("task-card-task-2")).toHaveAttribute("data-status", "in-progress")
      expect(screen.getByTestId("task-card-task-3")).toHaveAttribute("data-status", "completed")
    })

    it("renders every provided task title", () => {
      renderBoard()
      expect(screen.getByText("Todo Task")).toBeInTheDocument()
      expect(screen.getByText("In Progress Task")).toBeInTheDocument()
      expect(screen.getByText("Completed Task")).toBeInTheDocument()
    })

    it("shows an empty-state message for columns with no tasks", () => {
      render(<TaskBoard tasks={[mockTasks[0]]} onReorder={jest.fn()} />)
      expect(screen.getAllByText("No tasks")).toHaveLength(2)
    })

    it("shows a per-column count badge", () => {
      renderBoard()
      expect(screen.getAllByText("1")).toHaveLength(3)
    })

    it("omits tasks whose status is outside the three columns", () => {
      render(
        <TaskBoard
          tasks={[{ id: "w", title: "Wont", status: "wont-do", priority: "none", order: 0 } as any]}
          onReorder={jest.fn()}
        />
      )
      expect(screen.queryByTestId("task-card-w")).not.toBeInTheDocument()
    })
  })

  describe("Callbacks", () => {
    it("calls onUpdate when a task card reports an update", async () => {
      const onUpdate = jest.fn()
      renderBoard({ onUpdate })
      await userEvent.click(within(screen.getByTestId("task-card-task-1")).getByText("Update"))
      expect(onUpdate).toHaveBeenCalled()
    })

    it("renders without an onUpdate callback", () => {
      expect(() => render(<TaskBoard tasks={mockTasks} onReorder={jest.fn()} />)).not.toThrow()
    })
  })

  describe("Empty board", () => {
    it("renders all three empty columns", () => {
      render(<TaskBoard tasks={[]} onReorder={jest.fn()} />)
      expect(screen.getByText("To Do")).toBeInTheDocument()
      expect(screen.getAllByText("No tasks")).toHaveLength(3)
    })
  })

  describe("Static (filtered) mode", () => {
    it("renders without DndContext when reorderable is false", () => {
      render(<TaskBoard tasks={mockTasks} onReorder={jest.fn()} reorderable={false} />)
      expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
      expect(screen.queryByTestId("drag-overlay")).not.toBeInTheDocument()
    })

    it("still renders the columns and tasks when static", () => {
      render(<TaskBoard tasks={mockTasks} onReorder={jest.fn()} reorderable={false} />)
      expect(screen.getByText("To Do")).toBeInTheDocument()
      expect(screen.getByTestId("task-card-task-1")).toHaveAttribute("data-status", "todo")
      expect(screen.getByTestId("task-card-task-3")).toHaveAttribute("data-status", "completed")
    })
  })
})
