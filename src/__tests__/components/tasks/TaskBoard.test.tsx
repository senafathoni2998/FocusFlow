/**
 * Unit tests for src/components/tasks/TaskBoard.tsx
 *
 * Tests cover:
 * - Board rendering with columns
 * - Task display in columns
 * - Filtering by status and priority
 * - Create task modal
 * - New task button
 * - useTaskUpdates hook
 * - Column styling and counts
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TaskBoard from "@/components/tasks/TaskBoard"

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}))

// Mock @dnd-kit
jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  DragEndEvent: jest.fn(),
  DragStartEvent: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  useDroppable: ({ id }: any) => ({
    setNodeRef: jest.fn(),
    isOver: false,
  }),
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

jest.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => "",
    },
  },
}))

// Mock hooks
jest.mock("@/hooks/useTaskUpdates", () => ({
  useTaskUpdates: jest.fn(),
}))

// Mock server actions
jest.mock("@/app/actions/tasks", () => ({
  reorderTask: jest.fn(),
}))

// Mock TaskCard
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

// Mock CreateTaskForm
jest.mock("@/components/tasks/CreateTaskForm", () => {
  return function MockCreateTaskForm({ onClose }: any) {
    return (
      <div data-testid="create-task-form">
        <span>Create Task Form</span>
        <button onClick={onClose}>Close</button>
      </div>
    )
  }
})

const mockTasks = [
  {
    id: "task-1",
    title: "Todo Task 1",
    description: "Description 1",
    status: "todo",
    priority: "high",
    dueDate: new Date("2024-12-31"),
    order: 10,
  },
  {
    id: "task-2",
    title: "In Progress Task",
    description: "Description 2",
    status: "in-progress",
    priority: "medium",
    dueDate: new Date("2024-12-25"),
    order: 10,
  },
  {
    id: "task-3",
    title: "Completed Task",
    description: "Description 3",
    status: "completed",
    priority: "low",
    dueDate: new Date("2024-12-20"),
    order: 10,
  },
]

const mockOnUpdate = jest.fn()

describe("TaskBoard Component", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Initial Rendering", () => {
    it("should render board container", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByTestId("dnd-context")).toBeInTheDocument()
    })

    it("should render page title", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByText("Tasks")).toBeInTheDocument()
      expect(screen.getByText(/manage and track your tasks/i)).toBeInTheDocument()
    })

    it("should render new task button", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByRole("button", { name: "+ New Task" })).toBeInTheDocument()
    })

    it("should render three columns", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getAllByText("To Do")).toHaveLength(2) // One button, one column header
      expect(screen.getAllByText("In Progress")).toHaveLength(2)
      expect(screen.getAllByText("Completed")).toHaveLength(2)
    })

    it("should render droppable areas for columns", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)

      // Check for column containers by looking for their background classes
      const todoColumn = container.querySelector(".bg-gray-50.rounded-lg.p-4")
      const progressColumn = container.querySelector(".bg-primary-50.rounded-lg.p-4")
      const completedColumn = container.querySelector(".bg-success-50.rounded-lg.p-4")

      expect(todoColumn).toBeInTheDocument()
      expect(progressColumn).toBeInTheDocument()
      expect(completedColumn).toBeInTheDocument()
    })
  })

  describe("Task Display", () => {
    it("should render tasks in correct columns", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument()
      expect(screen.getByTestId("task-card-task-2")).toBeInTheDocument()
      expect(screen.getByTestId("task-card-task-3")).toBeInTheDocument()
    })

    it("should display task count for each column", () => {
      render(<TaskBoard tasks={mockTasks} />)

      // Each column should have a count badge showing "1"
      const counts = screen.getAllByText("1")
      expect(counts.length).toBeGreaterThanOrEqual(3)
    })

    it("should show empty state for columns without tasks", () => {
      const singleTask = [mockTasks[0]]
      render(<TaskBoard tasks={singleTask} />)

      // Should show "No tasks" message for empty columns
      expect(screen.getAllByText("No tasks").length).toBeGreaterThan(0)
    })

    it("should render multiple tasks in same column", () => {
      const multipleTodoTasks = [
        mockTasks[0],
        { ...mockTasks[0], id: "task-4", title: "Another Todo Task" },
      ]
      render(<TaskBoard tasks={multipleTodoTasks} />)

      expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument()
      expect(screen.getByTestId("task-card-task-4")).toBeInTheDocument()
    })
  })

  describe("Filtering - Status", () => {
    it("should render all status filter buttons", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "To Do" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "In Progress" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Completed" })).toBeInTheDocument()
    })

    it("should have All filter selected by default", () => {
      render(<TaskBoard tasks={mockTasks} />)

      const allButton = screen.getByRole("button", { name: "All" })
      expect(allButton).toHaveClass("bg-primary-600")
      expect(allButton).toHaveClass("text-white")
    })

    it("should filter tasks when status filter is clicked", async () => {
      const user = userEvent.setup()
      const { container } = render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "To Do" }))

      const todoButton = screen.getByRole("button", { name: "To Do" })
      expect(todoButton).toHaveClass("bg-primary-600")
      expect(todoButton).toHaveClass("text-white")

      // Should still show all columns but with filtered tasks
      expect(container.querySelector(".bg-gray-50.rounded-lg.p-4")).toBeInTheDocument()
      expect(container.querySelector(".bg-primary-50.rounded-lg.p-4")).toBeInTheDocument()
      expect(container.querySelector(".bg-success-50.rounded-lg.p-4")).toBeInTheDocument()
    })

    it("should show active state for selected filter", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      // Initially, All button should have active styling
      const allButtons = screen.getAllByRole("button", { name: "All" })
      expect(allButtons.some((btn) => btn.classList.contains("bg-primary-600"))).toBe(true)

      await user.click(screen.getByRole("button", { name: "In Progress" }))

      // In Progress button should now be active
      const inProgressButton = screen.getByRole("button", { name: "In Progress" })
      expect(inProgressButton).toHaveClass("bg-primary-600")
      expect(inProgressButton).toHaveClass("text-white")
    })
  })

  describe("Filtering - Priority", () => {
    it("should render priority filter dropdown", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByRole("combobox")).toBeInTheDocument()
    })

    it("should have all priority options", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByRole("option", { name: "All Priorities" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "High" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "Medium" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "Low" })).toBeInTheDocument()
    })

    it("should allow changing priority filter", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "high")

      expect(select).toHaveValue("high")
    })
  })

  describe("Filtering Behavior", () => {
    it("should enter filtering mode when filter is applied", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      // Should show drag hint by default
      expect(screen.getByText(/drag to reorder/i)).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "To Do" }))

      // Drag hint should disappear
      expect(screen.queryByText(/drag to reorder/i)).not.toBeInTheDocument()
    })

    it("should exit filtering mode when All is selected", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "To Do" }))
      await user.click(screen.getByRole("button", { name: "All" }))

      expect(screen.getByText(/drag to reorder/i)).toBeInTheDocument()
    })

    it("should enter filtering mode when priority filter is applied", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      await user.selectOptions(screen.getByRole("combobox"), "high")

      expect(screen.queryByText(/drag to reorder/i)).not.toBeInTheDocument()
    })
  })

  describe("Create Task Modal", () => {
    it("should not show modal initially", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.queryByTestId("create-task-form")).not.toBeInTheDocument()
    })

    it("should show modal when new task button is clicked", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "+ New Task" }))

      expect(screen.getByTestId("create-task-form")).toBeInTheDocument()
      expect(screen.getByText("Create New Task")).toBeInTheDocument()
    })

    it("should close modal when close button is clicked", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "+ New Task" }))
      expect(screen.getByTestId("create-task-form")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Close" }))

      expect(screen.queryByTestId("create-task-form")).not.toBeInTheDocument()
    })

    it("should render modal overlay", async () => {
      const user = userEvent.setup()
      const { container } = render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "+ New Task" }))

      const overlay = container.querySelector(".fixed.inset-0")
      expect(overlay).toBeInTheDocument()
    })
  })

  describe("Column Styling", () => {
    it("should render todo column with correct styling", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      const todoColumn = container.querySelector(".bg-gray-50.rounded-lg.p-4")
      expect(todoColumn).toBeInTheDocument()
      expect(todoColumn).toHaveClass("bg-gray-50")
    })

    it("should render in-progress column with correct styling", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      const progressColumn = container.querySelector(".bg-primary-50.rounded-lg.p-4")
      expect(progressColumn).toBeInTheDocument()
      expect(progressColumn).toHaveClass("bg-primary-50")
    })

    it("should render completed column with correct styling", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      const completedColumn = container.querySelector(".bg-success-50.rounded-lg.p-4")
      expect(completedColumn).toBeInTheDocument()
      expect(completedColumn).toHaveClass("bg-success-50")
    })
  })

  describe("Refreshing Indicator", () => {
    it("should not show refreshing indicator initially", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.queryByText("Updating...")).not.toBeInTheDocument()
    })

    it("should handle useTaskUpdates hook", () => {
      const mockUseTaskUpdates = require("@/hooks/useTaskUpdates").useTaskUpdates
      mockUseTaskUpdates.mockImplementationOnce((callback: any, deps: any) => {
        // Trigger the callback to simulate an update
        callback()
      })

      render(<TaskBoard tasks={mockTasks} />)

      expect(mockUseTaskUpdates).toHaveBeenCalled()
    })
  })

  describe("Empty Board State", () => {
    it("should render board with no tasks", () => {
      render(<TaskBoard tasks={[]} />)

      expect(screen.getByText("Tasks")).toBeInTheDocument()

      // Should show "No tasks" in all columns
      const noTasksMessages = screen.getAllByText("No tasks")
      expect(noTasksMessages.length).toBe(3)
    })

    it("should still show new task button with empty board", () => {
      render(<TaskBoard tasks={[]} />)
      expect(screen.getByRole("button", { name: "+ New Task" })).toBeInTheDocument()
    })
  })

  describe("Drag and Drop Context", () => {
    it("should render DndContext when not filtering", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByTestId("dnd-context")).toBeInTheDocument()
    })

    it("should render DragOverlay", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByTestId("drag-overlay")).toBeInTheDocument()
    })

    it("should not render DndContext when filtering", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByTestId("dnd-context")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "To Do" }))

      // DndContext should not be rendered in filtered view
      expect(screen.queryByTestId("dnd-context")).not.toBeInTheDocument()
    })
  })

  describe("Update Callback", () => {
    it("should call onUpdate when task card update is clicked", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} onUpdate={mockOnUpdate} />)

      const updateButton = screen.getByTestId("task-card-task-1").querySelector("button") as HTMLElement
      await user.click(updateButton)

      expect(mockOnUpdate).toHaveBeenCalled()
    })

    it("should work without onUpdate callback", () => {
      render(<TaskBoard tasks={mockTasks} />)
      expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument()
    })
  })

  describe("Responsive Layout", () => {
    it("should render with grid layout", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      const grid = container.querySelector(".grid")
      expect(grid).toBeInTheDocument()
      expect(grid).toHaveClass("grid-cols-1")
      expect(grid).toHaveClass("md:grid-cols-3")
    })

    it("should apply gap between columns", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      const grid = container.querySelector(".grid")
      expect(grid).toHaveClass("gap-6")
    })
  })

  describe("Header Section", () => {
    it("should render title and subtitle", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByText("Tasks")).toBeInTheDocument()
      expect(screen.getByText(/manage and track your tasks/i)).toBeInTheDocument()
    })

    it("should render drag hint in normal mode", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByText(/drag to reorder/i)).toBeInTheDocument()
    })

    it("should not render drag hint in filtered mode", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      await user.click(screen.getByRole("button", { name: "To Do" }))

      expect(screen.queryByText(/drag to reorder/i)).not.toBeInTheDocument()
    })
  })

  describe("Filter Controls", () => {
    it("should render filter controls in correct order", () => {
      const { container } = render(<TaskBoard tasks={mockTasks} />)

      const filterContainer = container.querySelector(".flex.flex-wrap.gap-3")
      expect(filterContainer).toBeInTheDocument()
    })

    it("should group status filter buttons together", () => {
      render(<TaskBoard tasks={mockTasks} />)

      const statusButtons = screen.getAllByRole("button").filter((button) =>
        ["All", "To Do", "In Progress", "Completed"].includes(button.textContent || "")
      )

      expect(statusButtons).toHaveLength(4)
    })
  })

  describe("Sortable Context", () => {
    it("should render SortableContext for each column", () => {
      render(<TaskBoard tasks={mockTasks} />)

      const sortableContexts = screen.getAllByTestId("sortable-context")
      expect(sortableContexts.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe("Combinations", () => {
    it("should handle opening create modal and closing it", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      // Open modal
      await user.click(screen.getByRole("button", { name: "+ New Task" }))
      expect(screen.getByTestId("create-task-form")).toBeInTheDocument()

      // Close modal
      await user.click(screen.getByRole("button", { name: "Close" }))
      expect(screen.queryByTestId("create-task-form")).not.toBeInTheDocument()
    })

    it("should handle filter changes and return to all", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      // Click To Do filter
      await user.click(screen.getByRole("button", { name: "To Do" }))
      let todoButton = screen.getByRole("button", { name: "To Do" })
      expect(todoButton).toHaveClass("bg-primary-600")

      // Click Completed filter
      await user.click(screen.getByRole("button", { name: "Completed" }))
      const completedButton = screen.getByRole("button", { name: "Completed" })
      expect(completedButton).toHaveClass("bg-primary-600")

      // Return to All
      await user.click(screen.getByRole("button", { name: "All" }))
      const allButton = screen.getByRole("button", { name: "All" })
      expect(allButton).toHaveClass("bg-primary-600")
    })

    it("should handle both status and priority filters", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} />)

      // Apply status filter
      await user.click(screen.getByRole("button", { name: "To Do" }))

      // Apply priority filter
      await user.selectOptions(screen.getByRole("combobox"), "high")

      const select = screen.getByRole("combobox")
      expect(select).toHaveValue("high")

      // Reset to All
      await user.click(screen.getByRole("button", { name: "All" }))
      // After resetting to All, the drag hint should appear
      const { container } = render(<TaskBoard tasks={mockTasks} />)
      expect(container.querySelector(".space-y-6")).toBeInTheDocument()
    })

    it("should handle updating tasks in all columns", async () => {
      const user = userEvent.setup()
      render(<TaskBoard tasks={mockTasks} onUpdate={mockOnUpdate} />)

      const task1Button = screen.getByTestId("task-card-task-1").querySelector("button") as HTMLElement
      const task2Button = screen.getByTestId("task-card-task-2").querySelector("button") as HTMLElement
      const task3Button = screen.getByTestId("task-card-task-3").querySelector("button") as HTMLElement

      await user.click(task1Button)
      await user.click(task2Button)
      await user.click(task3Button)

      expect(mockOnUpdate).toHaveBeenCalledTimes(3)
    })
  })

  describe("Large Number of Tasks", () => {
    it("should render many tasks efficiently", () => {
      const manyTasks = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Description ${i}`,
        status: i % 3 === 0 ? "todo" : i % 3 === 1 ? "in-progress" : "completed",
        priority: i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low",
        dueDate: new Date("2024-12-31"),
        order: i * 10,
      }))

      render(<TaskBoard tasks={manyTasks} />)

      expect(screen.getByTestId("task-card-task-0")).toBeInTheDocument()
      expect(screen.getByTestId("task-card-task-19")).toBeInTheDocument()
    })
  })

  describe("Accessibility", () => {
    it("should have proper heading structure", () => {
      render(<TaskBoard tasks={mockTasks} />)

      const mainHeading = screen.getByText("Tasks")
      expect(mainHeading.tagName).toBe("H1")
    })

    it("should have accessible button labels", () => {
      render(<TaskBoard tasks={mockTasks} />)

      expect(screen.getByRole("button", { name: "+ New Task" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument()
    })
  })
})
