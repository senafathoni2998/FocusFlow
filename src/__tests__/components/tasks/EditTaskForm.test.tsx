/**
 * Unit tests for src/components/tasks/EditTaskForm.tsx
 *
 * Tests cover:
 * - Form rendering with pre-populated values
 * - Input fields (title, description, priority, due date)
 * - Form validation
 * - Markdown keyboard shortcuts (Ctrl+B, Ctrl+I)
 * - Form submission with updateTask
 * - Error handling
 * - Loading states
 * - onClose and onUpdate callbacks
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import EditTaskForm from "@/components/tasks/EditTaskForm"

// Mock server actions
jest.mock("@/app/actions/tasks", () => ({
  updateTask: jest.fn(),
}))

const mockTask = {
  id: "task-1",
  title: "Existing Task",
  description: "Existing description",
  priority: "high",
  dueDate: new Date("2024-12-31"),
}

describe("EditTaskForm Component", () => {
  let mockUpdateTask: jest.Mock
  const mockOnClose = jest.fn()
  const mockOnUpdate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateTask = require("@/app/actions/tasks").updateTask
  })

  describe("Initial Rendering with Pre-populated Data", () => {
    it("should render form element", () => {
      render(<EditTaskForm task={mockTask} />)
      const form = document.querySelector("form")
      expect(form).toBeInTheDocument()
    })

    it("should pre-populate title field", () => {
      render(<EditTaskForm task={mockTask} />)
      const titleInput = screen.getByLabelText(/title \*/i)
      expect(titleInput).toHaveValue("Existing Task")
    })

    it("should pre-populate description field", () => {
      render(<EditTaskForm task={mockTask} />)
      const descriptionTextarea = screen.getByLabelText(/description/i)
      expect(descriptionTextarea).toHaveValue("Existing description")
    })

    it("should pre-populate priority field", () => {
      render(<EditTaskForm task={mockTask} />)
      const prioritySelect = screen.getByLabelText(/priority/i)
      expect(prioritySelect).toHaveValue("high")
    })

    it("should pre-populate due date field", () => {
      render(<EditTaskForm task={mockTask} />)
      const dueDateInput = screen.getByLabelText(/due date/i)
      expect(dueDateInput).toHaveValue("2024-12-31")
    })

    it("should handle null due date", () => {
      const taskWithoutDate = { ...mockTask, dueDate: null }
      render(<EditTaskForm task={taskWithoutDate} />)
      const dueDateInput = screen.getByLabelText(/due date/i)
      expect(dueDateInput).toHaveValue("")
    })

    it("should handle null description", () => {
      const taskWithoutDescription = { ...mockTask, description: null }
      render(<EditTaskForm task={taskWithoutDescription} />)
      const descriptionTextarea = screen.getByLabelText(/description/i)
      expect(descriptionTextarea).toHaveValue("")
    })

    it("should render cancel button", () => {
      render(<EditTaskForm task={mockTask} />)
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    })

    it("should render save changes button", () => {
      render(<EditTaskForm task={mockTask} />)
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument()
    })
  })

  describe("Input Field Modifications", () => {
    it("should allow modifying title field", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} />)

      const titleInput = screen.getByLabelText(/title \*/i)
      await user.clear(titleInput)
      await user.type(titleInput, "Updated Title")

      expect(titleInput).toHaveValue("Updated Title")
    })

    it("should allow modifying description field", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.clear(descriptionTextarea)
      await user.type(descriptionTextarea, "Updated description")

      expect(descriptionTextarea).toHaveValue("Updated description")
    })

    it("should allow changing priority", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} />)

      const prioritySelect = screen.getByLabelText(/priority/i)
      await user.selectOptions(prioritySelect, "low")

      expect(prioritySelect).toHaveValue("low")
    })

    it("should allow modifying due date", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} />)

      const dueDateInput = screen.getByLabelText(/due date/i)
      await user.clear(dueDateInput)
      await user.type(dueDateInput, "2025-01-15")

      expect(dueDateInput).toHaveValue("2025-01-15")
    })

    it("should allow clearing due date", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} />)

      const dueDateInput = screen.getByLabelText(/due date/i)
      await user.clear(dueDateInput)

      expect(dueDateInput).toHaveValue("")
    })
  })

  describe("Markdown Keyboard Shortcuts", () => {
    it("should insert bold markdown with Ctrl+B on non-Mac", async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      })

      render(<EditTaskForm task={mockTask} />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.clear(descriptionTextarea)
      await user.type(descriptionTextarea, "selected text")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 0
      textarea.selectionEnd = 13

      await user.keyboard("{Control>}{b}")

      expect(textarea.value).toBe("**selected text**")
    })

    it("should insert italic markdown with Ctrl+I on non-Mac", async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      })

      render(<EditTaskForm task={mockTask} />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.clear(descriptionTextarea)
      await user.type(descriptionTextarea, "selected text")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 0
      textarea.selectionEnd = 13

      await user.keyboard("{Control>}{i}")

      expect(textarea.value).toBe("*selected text*")
    })

    it("should insert bold markdown with Cmd+B on Mac", async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, "platform", {
        value: "MacIntel",
        writable: true,
      })

      render(<EditTaskForm task={mockTask} />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.clear(descriptionTextarea)
      await user.type(descriptionTextarea, "selected text")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 0
      textarea.selectionEnd = 13

      await user.keyboard("{Meta>}{b}")

      expect(textarea.value).toBe("**selected text**")
    })

    it("should wrap selected text with bold markdown", async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      })

      render(<EditTaskForm task={mockTask} />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.clear(descriptionTextarea)
      await user.type(descriptionTextarea, "Some text before selected and after")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 15
      textarea.selectionEnd = 22

      await user.keyboard("{Control>}{b}")

      expect(textarea.value).toContain("**")
    })
  })

  describe("Form Submission", () => {
    it("should submit form with updated values", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.clear(screen.getByLabelText(/title \*/i))
      await user.type(screen.getByLabelText(/title \*/i), "Updated Title")
      await user.clear(screen.getByLabelText(/description/i))
      await user.type(screen.getByLabelText(/description/i), "Updated description")
      await user.selectOptions(screen.getByLabelText(/priority/i), "medium")
      await user.clear(screen.getByLabelText(/due date/i))
      await user.type(screen.getByLabelText(/due date/i), "2025-01-15")

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", {
          title: "Updated Title",
          description: "Updated description",
          priority: "medium",
          dueDate: "2025-01-15",
        })
      })
    })

    it("should call onUpdate after successful submission", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled()
      })
    })

    it("should call onClose after successful submission", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it("should call onUpdate before onClose", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      let callOrder: string[] = []
      const orderedOnUpdate = () => callOrder.push("update")
      const orderedOnClose = () => callOrder.push("close")

      render(
        <EditTaskForm
          task={mockTask}
          onClose={orderedOnClose}
          onUpdate={orderedOnUpdate}
        />
      )

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(callOrder).toEqual(["update", "close"])
      })
    })

    it("should submit with empty due date when cleared", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.clear(screen.getByLabelText(/due date/i))
      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith("task-1", {
          title: "Existing Task",
          description: "Existing description",
          priority: "high",
          dueDate: "",
        })
      })
    })
  })

  describe("Error Handling", () => {
    it("should display error message when submission fails", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({
        success: false,
        error: "Failed to update task",
      })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("Failed to update task")).toBeInTheDocument()
      })
    })

    it("should not call onClose when submission fails", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({
        success: false,
        error: "Error",
      })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument()
      })

      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it("should not call onUpdate when submission fails", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({
        success: false,
        error: "Error",
      })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument()
      })

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it("should clear previous error on new submission attempt", async () => {
      const user = userEvent.setup()
      mockUpdateTask
        .mockResolvedValueOnce({
          success: false,
          error: "First error",
        })
        .mockResolvedValueOnce({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("First error")).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.queryByText("First error")).not.toBeInTheDocument()
      })
    })
  })

  describe("Loading States", () => {
    it("should show loading text during submission", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument()
      })
    })

    it("should disable submit button during loading", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      const submitButton = screen.getByRole("button", { name: "Saving..." })
      expect(submitButton).toBeDisabled()
    })

    it("should re-enable submit button after failed submission", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({
        success: false,
        error: "Error",
      })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument()
      })

      expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled()
    })
  })

  describe("Cancel Button", () => {
    it("should call onClose when cancel button is clicked", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it("should not call onUpdate when cancel is clicked", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it("should not submit form when cancel is clicked", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      await user.clear(screen.getByLabelText(/title \*/i))
      await user.type(screen.getByLabelText(/title \*/i), "Modified but cancelled")
      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  describe("Form Styling", () => {
    it("should render title input with correct classes", () => {
      const { container } = render(<EditTaskForm task={mockTask} />)
      const titleInput = container.querySelector("input[type='text']")
      expect(titleInput).toHaveClass("w-full")
      expect(titleInput).toHaveClass("px-4")
      expect(titleInput).toHaveClass("py-2")
    })

    it("should render description textarea with monospace font", () => {
      const { container } = render(<EditTaskForm task={mockTask} />)
      const textarea = container.querySelector("textarea")
      expect(textarea).toHaveClass("font-mono")
      expect(textarea).toHaveClass("text-sm")
    })

    it("should render form with spacing", () => {
      const { container } = render(<EditTaskForm task={mockTask} />)
      const form = container.querySelector("form")
      expect(form).toHaveClass("space-y-4")
    })
  })

  describe("Accessibility", () => {
    it("should have proper label associations", () => {
      render(<EditTaskForm task={mockTask} />)

      const titleInput = screen.getByLabelText(/title \*/i)
      expect(titleInput).toHaveAttribute("id", "edit-title")

      const descriptionTextarea = screen.getByLabelText(/description/i)
      expect(descriptionTextarea).toHaveAttribute("id", "edit-description")
    })

    it("should show required indicator on title label", () => {
      render(<EditTaskForm task={mockTask} />)
      const titleLabel = screen.getByLabelText(/title \*/i)
      expect(titleLabel).toBeInTheDocument()
    })
  })

  describe("Callbacks", () => {
    it("should work without onClose callback", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onUpdate={mockOnUpdate} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled()
      })
    })

    it("should work without onUpdate callback", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled()
      })
    })

    it("should work without any callbacks", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })

      render(<EditTaskForm task={mockTask} />)

      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalled()
      })
    })
  })

  describe("Combinations", () => {
    it("should handle form with all fields modified and error then success", async () => {
      const user = userEvent.setup()
      mockUpdateTask
        .mockResolvedValueOnce({
          success: false,
          error: "Network error",
        })
        .mockResolvedValueOnce({ success: true })

      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      // Modify all fields
      await user.clear(screen.getByLabelText(/title \*/i))
      await user.type(screen.getByLabelText(/title \*/i), "Complete Update")
      await user.clear(screen.getByLabelText(/description/i))
      await user.type(screen.getByLabelText(/description/i), "Full updated description")
      await user.selectOptions(screen.getByLabelText(/priority/i), "low")
      await user.clear(screen.getByLabelText(/due date/i))
      await user.type(screen.getByLabelText(/due date/i), "2024-12-25")

      // First submission fails
      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument()
      })

      // Second submission succeeds
      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled()
        expect(mockOnClose).toHaveBeenCalled()
      })
    })
  })
})
