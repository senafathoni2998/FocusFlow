/**
 * Unit tests for src/components/tasks/TaskCard.tsx
 *
 * Tests cover:
 * - Task rendering
 * - Title and description display
 * - Priority badge
 * - Due date display
 * - Status dropdown and changes
 * - Edit button and modal
 * - Delete button with confirmation
 * - Completed task styling
 * - Markdown rendering
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TaskCard from "@/components/tasks/TaskCard"

// Mock server actions
jest.mock("@/app/actions/tasks", () => ({
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
}))

// Mock react-markdown
jest.mock("react-markdown", () => {
  return function MockReactMarkdown({ children }: any) {
    return <div data-testid="markdown-description">{children}</div>
  }
})

jest.mock("remark-gfm", () => ({
  default: jest.fn(),
}))

// Mock EditTaskForm
jest.mock("@/components/tasks/EditTaskForm", () => {
  return function MockEditTaskForm({ task, onClose, onUpdate }: any) {
    const handleSave = () => {
      onUpdate?.()
      onClose?.()
    }
    return (
      <div data-testid="edit-task-form">
        <span>Editing: {task.title}</span>
        <button onClick={onClose}>Close Edit</button>
        <button onClick={handleSave}>Save</button>
      </div>
    )
  }
})

const mockTask = {
  id: "task-1",
  title: "Test Task",
  description: "Test description with **bold** and *italic*",
  status: "todo",
  priority: "high",
  dueDate: new Date("2024-12-31"),
}

const mockOnUpdate = jest.fn()

describe("TaskCard Component", () => {
  let mockUpdateTask: jest.Mock
  let mockDeleteTask: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateTask = require("@/app/actions/tasks").updateTask
    mockDeleteTask = require("@/app/actions/tasks").deleteTask
    global.confirm = jest.fn(() => true) as any
  })

  describe("Task Rendering", () => {
    it("should render task title", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByText("Test Task")).toBeInTheDocument()
    })

    it("should render task description when present", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByTestId("markdown-description")).toBeInTheDocument()
      expect(screen.getByTestId("markdown-description")).toHaveTextContent("Test description with **bold** and *italic*")
    })

    it("should not render description section when description is null", () => {
      const taskWithoutDescription = { ...mockTask, description: null }
      render(<TaskCard task={taskWithoutDescription} />)
      expect(screen.queryByTestId("markdown-description")).not.toBeInTheDocument()
    })

    it("should render task card container", () => {
      const { container } = render(<TaskCard task={mockTask} />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("rounded-lg")
      expect(card).toHaveClass("shadow-sm")
    })

    it("should apply hover effect", () => {
      const { container } = render(<TaskCard task={mockTask} />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("hover:shadow-md")
      expect(card).toHaveClass("transition")
    })
  })

  describe("Priority Badge", () => {
    it("should render high priority badge", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByText("High Priority")).toBeInTheDocument()
    })

    it("should render medium priority badge", () => {
      const mediumTask = { ...mockTask, priority: "medium" }
      render(<TaskCard task={mediumTask} />)
      expect(screen.getByText("Medium Priority")).toBeInTheDocument()
    })

    it("should render low priority badge", () => {
      const lowTask = { ...mockTask, priority: "low" }
      render(<TaskCard task={lowTask} />)
      expect(screen.getByText("Low Priority")).toBeInTheDocument()
    })

    it("should capitalize first letter of priority", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByText(/High Priority/)).toBeInTheDocument()
    })
  })

  describe("Due Date Display", () => {
    it("should render due date when present", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByText(/Due:/)).toBeInTheDocument()
    })

    it("should format due date correctly", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByText(/Due: Dec 31/)).toBeInTheDocument()
    })

    it("should not render due date when null", () => {
      const taskWithoutDate = { ...mockTask, dueDate: null }
      render(<TaskCard task={taskWithoutDate} />)
      expect(screen.queryByText(/Due:/)).not.toBeInTheDocument()
    })
  })

  describe("Status Dropdown", () => {
    it("should render status dropdown", () => {
      render(<TaskCard task={mockTask} />)
      const select = screen.getByRole("combobox")
      expect(select).toBeInTheDocument()
    })

    it("should display current status", () => {
      render(<TaskCard task={mockTask} />)
      const select = screen.getByRole("combobox") as HTMLSelectElement
      expect(select.value).toBe("todo")
    })

    it("should have all status options", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByRole("option", { name: "To Do" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "In Progress" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "Completed" })).toBeInTheDocument()
    })

    it("should call updateTask when status changes", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "in-progress")

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", {
          status: "in-progress",
        })
      })
    })

    it("should call onUpdate after status change", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "completed")

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled()
      })
    })

    it("should apply correct color classes for todo status", () => {
      const todoTask = { ...mockTask, status: "todo" as const }
      const { container } = render(<TaskCard task={todoTask} />)
      const select = container.querySelector("select")
      expect(select).toHaveClass("bg-gray-100")
      expect(select).toHaveClass("text-gray-800")
    })

    it("should apply correct color classes for in-progress status", () => {
      const progressTask = { ...mockTask, status: "in-progress" as const }
      const { container } = render(<TaskCard task={progressTask} />)
      const select = container.querySelector("select")
      expect(select).toHaveClass("bg-primary-100")
      expect(select).toHaveClass("text-primary-800")
    })

    it("should apply correct color classes for completed status", () => {
      const completedTask = { ...mockTask, status: "completed" as const }
      const { container } = render(<TaskCard task={completedTask} />)
      const select = container.querySelector("select")
      expect(select).toHaveClass("bg-success-100")
      expect(select).toHaveClass("text-success-800")
    })
  })

  describe("Edit Button", () => {
    it("should render edit button", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
    })

    it("should open edit modal when clicked", async () => {
      const user = userEvent.setup()
      render(<TaskCard task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Edit" }))

      expect(screen.getByTestId("edit-task-form")).toBeInTheDocument()
      expect(screen.getByText("Editing: Test Task")).toBeInTheDocument()
    })

    it("should close edit modal when close button is clicked", async () => {
      const user = userEvent.setup()
      render(<TaskCard task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Edit" }))
      expect(screen.getByTestId("edit-task-form")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Close Edit" }))
      expect(screen.queryByTestId("edit-task-form")).not.toBeInTheDocument()
    })
  })

  describe("Delete Button", () => {
    it("should render delete button", () => {
      render(<TaskCard task={mockTask} />)
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    })

    it("should show confirmation dialog when delete is clicked", async () => {
      const user = userEvent.setup()
      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      expect(global.confirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this task?"
      )
    })

    it("should call deleteTask when confirmed", async () => {
      const user = userEvent.setup()
      mockDeleteTask.mockResolvedValue({ success: true })
      global.confirm = jest.fn(() => true) as any

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      await waitFor(() => {
        expect(mockDeleteTask).toHaveBeenCalledWith("task-1")
      })
    })

    it("should not call deleteTask when cancelled", async () => {
      const user = userEvent.setup()
      global.confirm = jest.fn(() => false) as any

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      expect(mockDeleteTask).not.toHaveBeenCalled()
    })

    it("should call onUpdate after successful deletion", async () => {
      const user = userEvent.setup()
      mockDeleteTask.mockResolvedValue({ success: true })
      global.confirm = jest.fn(() => true) as any

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled()
      })
    })

    it("should show loading state during deletion", async () => {
      const user = userEvent.setup()
      mockDeleteTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )
      global.confirm = jest.fn(() => true) as any

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Deleting..." })).toBeInTheDocument()
      })
    })

    it("should disable delete button during deletion", async () => {
      const user = userEvent.setup()
      mockDeleteTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )
      global.confirm = jest.fn(() => true) as any

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Delete" }))

      await waitFor(() => {
        const deleteButton = screen.getByRole("button", { name: "Deleting..." })
        expect(deleteButton).toBeDisabled()
      })
    })
  })

  describe("Completed Task Styling", () => {
    it("should apply opacity to completed tasks", () => {
      const completedTask = { ...mockTask, status: "completed" as const }
      const { container } = render(<TaskCard task={completedTask} />)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("opacity-60")
    })

    it("should not apply opacity to non-completed tasks", () => {
      const { container } = render(<TaskCard task={mockTask} />)
      const card = container.firstChild as HTMLElement
      expect(card).not.toHaveClass("opacity-60")
    })

    it("should apply line-through to completed task title", () => {
      const completedTask = { ...mockTask, status: "completed" as const }
      render(<TaskCard task={completedTask} />)
      const title = screen.getByText("Test Task")
      expect(title).toHaveClass("line-through")
      expect(title).toHaveClass("text-gray-500")
    })

    it("should not apply line-through to non-completed task title", () => {
      render(<TaskCard task={mockTask} />)
      const title = screen.getByText("Test Task")
      expect(title).not.toHaveClass("line-through")
      expect(title).toHaveClass("text-gray-900")
    })
  })

  describe("Markdown Rendering", () => {
    it("should render description content with markdown syntax", () => {
      render(<TaskCard task={mockTask} />)
      const markdownDiv = screen.getByTestId("markdown-description")
      expect(markdownDiv).toHaveTextContent("**bold**")
      expect(markdownDiv).toHaveTextContent("*italic*")
    })

    it("should render bullet list content", () => {
      const taskWithList = {
        ...mockTask,
        description: "- Item 1\n- Item 2\n- Item 3",
      }
      render(<TaskCard task={taskWithList} />)
      const markdownDiv = screen.getByTestId("markdown-description")
      expect(markdownDiv).toHaveTextContent("Item 1")
      expect(markdownDiv).toHaveTextContent("Item 2")
      expect(markdownDiv).toHaveTextContent("Item 3")
    })

    it("should render numbered list content", () => {
      const taskWithNumberedList = {
        ...mockTask,
        description: "1. First\n2. Second\n3. Third",
      }
      render(<TaskCard task={taskWithNumberedList} />)
      const markdownDiv = screen.getByTestId("markdown-description")
      expect(markdownDiv).toHaveTextContent("First")
      expect(markdownDiv).toHaveTextContent("Second")
      expect(markdownDiv).toHaveTextContent("Third")
    })

    it("should render link content", () => {
      const taskWithLink = {
        ...mockTask,
        description: "[Example](https://example.com)",
      }
      render(<TaskCard task={taskWithLink} />)
      const markdownDiv = screen.getByTestId("markdown-description")
      expect(markdownDiv).toHaveTextContent("Example")
    })

    it("should render inline code content", () => {
      const taskWithCode = {
        ...mockTask,
        description: "Use `console.log()` for debugging",
      }
      render(<TaskCard task={taskWithCode} />)
      const markdownDiv = screen.getByTestId("markdown-description")
      expect(markdownDiv).toHaveTextContent("console.log()")
    })
  })

  describe("Modal", () => {
    it("should render modal overlay", async () => {
      const user = userEvent.setup()
      const { container } = render(<TaskCard task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Edit" }))

      const overlay = container.querySelector(".fixed.inset-0")
      expect(overlay).toBeInTheDocument()
      expect(overlay).toHaveClass("bg-black/50")
    })

    it("should render modal content container", async () => {
      const user = userEvent.setup()
      const { container } = render(<TaskCard task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Edit" }))

      const modal = container.querySelector(".bg-white.rounded-xl")
      expect(modal).toBeInTheDocument()
    })

    it("should have close button in modal header", async () => {
      const user = userEvent.setup()
      render(<TaskCard task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Edit" }))

      expect(screen.getByText("Edit Task")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Close Edit" })).toBeInTheDocument()
    })
  })

  describe("Callback Propagation", () => {
    it("should work without onUpdate callback", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<TaskCard task={mockTask} />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "in-progress")

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled()
      })
    })
  })

  describe("Combinations", () => {
    it("should handle edit modal open and close with onUpdate", async () => {
      const user = userEvent.setup()

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      // Open edit modal
      await user.click(screen.getByRole("button", { name: "Edit" }))
      expect(screen.getByTestId("edit-task-form")).toBeInTheDocument()

      // Save from edit form
      await user.click(screen.getByRole("button", { name: "Save" }))

      expect(mockOnUpdate).toHaveBeenCalled()
      expect(screen.queryByTestId("edit-task-form")).not.toBeInTheDocument()
    })

    it("should handle multiple status changes", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<TaskCard task={mockTask} onUpdate={mockOnUpdate} />)

      const select = screen.getByRole("combobox")

      await user.selectOptions(select, "in-progress")
      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { status: "in-progress" })
      })

      await user.selectOptions(select, "completed")
      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { status: "completed" })
      })

      await user.selectOptions(select, "todo")
      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", { status: "todo" })
      })

      expect(mockUpdateTask).toHaveBeenCalledTimes(3)
    })
  })

  describe("Task with All Features", () => {
    it("should render task with all properties", () => {
      const fullTask = {
        id: "full-task",
        title: "Complete Task",
        description: "Description with **bold**, *italic*, and [link](https://example.com)",
        status: "in-progress" as const,
        priority: "high",
        dueDate: new Date("2024-12-25"),
      }

      render(<TaskCard task={fullTask} />)

      expect(screen.getByText("Complete Task")).toBeInTheDocument()
      expect(screen.getByTestId("markdown-description")).toBeInTheDocument()
      expect(screen.getByText("High Priority")).toBeInTheDocument()
      expect(screen.getByText(/Due: Dec 25/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    })
  })
})
