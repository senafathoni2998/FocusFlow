/**
 * Unit tests for src/components/tasks/CreateTaskForm.tsx
 *
 * Tests cover:
 * - Form rendering
 * - Input fields (title, description, priority, due date)
 * - Form validation
 * - Markdown keyboard shortcuts (Ctrl+B, Ctrl+I)
 * - Form submission
 * - Error handling
 * - Loading states
 * - onClose callback
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import CreateTaskForm from "@/components/tasks/CreateTaskForm"

// Mock server actions
jest.mock("@/app/actions/tasks", () => ({
  createTask: jest.fn(),
}))

describe("CreateTaskForm Component", () => {
  let mockCreateTask: jest.Mock
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateTask = require("@/app/actions/tasks").createTask
  })

  describe("Initial Rendering", () => {
    it("should render form element", () => {
      render(<CreateTaskForm />)
      const form = document.querySelector("form")
      expect(form).toBeInTheDocument()
    })

    it("should render title input", () => {
      render(<CreateTaskForm />)
      expect(screen.getByLabelText(/title \*/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText("Task title")).toBeInTheDocument()
    })

    it("should render description textarea", () => {
      render(<CreateTaskForm />)
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    })

    it("should render priority select", () => {
      render(<CreateTaskForm />)
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument()
    })

    it("should render due date input", () => {
      render(<CreateTaskForm />)
      expect(screen.getByLabelText(/due date/i)).toBeInTheDocument()
    })

    it("should render cancel button", () => {
      render(<CreateTaskForm />)
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    })

    it("should render create task button", () => {
      render(<CreateTaskForm />)
      expect(screen.getByRole("button", { name: "Create Task" })).toBeInTheDocument()
    })

    it("should have medium priority selected by default", () => {
      render(<CreateTaskForm />)
      const prioritySelect = screen.getByLabelText(/priority/i)
      expect(prioritySelect).toHaveValue("medium")
    })

    it("should render markdown hint in description label", () => {
      render(<CreateTaskForm />)
      expect(screen.getByText(/supports markdown - ctrl\+b bold/i)).toBeInTheDocument()
    })
  })

  describe("Input Fields", () => {
    it("should allow typing in title field", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm />)

      const titleInput = screen.getByLabelText(/title \*/i)
      await user.type(titleInput, "New Task Title")

      expect(titleInput).toHaveValue("New Task Title")
    })

    it("should allow typing in description field", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.type(descriptionTextarea, "Task description")

      expect(descriptionTextarea).toHaveValue("Task description")
    })

    it("should allow changing priority", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm />)

      const prioritySelect = screen.getByLabelText(/priority/i)
      await user.selectOptions(prioritySelect, "high")

      expect(prioritySelect).toHaveValue("high")
    })

    it("should allow setting due date", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm />)

      const dueDateInput = screen.getByLabelText(/due date/i)
      await user.type(dueDateInput, "2024-12-31")

      expect(dueDateInput).toHaveValue("2024-12-31")
    })

    it("should have title field as required", () => {
      render(<CreateTaskForm />)
      const titleInput = screen.getByLabelText(/title \*/i)
      expect(titleInput).toBeRequired()
    })
  })

  describe("Markdown Keyboard Shortcuts", () => {
    it("should insert bold markdown with Ctrl+B on non-Mac", async () => {
      const user = userEvent.setup()
      // Mock navigator.platform for non-Mac
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      })

      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.type(descriptionTextarea, "selected text")

      // Select the text
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

      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
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

      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
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

      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.type(descriptionTextarea, "Some text before selected and after")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 15
      textarea.selectionEnd = 22

      await user.keyboard("{Control>}{b}")

      expect(textarea.value).toContain("**")
    })

    it("should insert markdown at cursor position when no text is selected", async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
      })

      render(<CreateTaskForm />)

      const descriptionTextarea = screen.getByLabelText(/description/i)
      await user.type(descriptionTextarea, "Hello")

      const textarea = descriptionTextarea as HTMLTextAreaElement
      textarea.selectionStart = 5
      textarea.selectionEnd = 5

      await user.keyboard("{Control>}{b}")

      expect(textarea.value).toContain("**")
    })
  })

  describe("Form Submission", () => {
    it("should submit form with all fields", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.type(screen.getByLabelText(/description/i), "Test description")
      await user.selectOptions(screen.getByLabelText(/priority/i), "high")
      await user.type(screen.getByLabelText(/due date/i), "2024-12-31")

      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(mockCreateTask).toHaveBeenCalledWith({
          title: "Test Task",
          description: "Test description",
          priority: "high",
          dueDate: "2024-12-31",
        })
      })
    })

    it("should call onClose after successful submission", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it("should reset form after successful submission", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.type(screen.getByLabelText(/description/i), "Test description")
      await user.selectOptions(screen.getByLabelText(/priority/i), "high")
      await user.type(screen.getByLabelText(/due date/i), "2024-12-31")

      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByLabelText(/title \*/i)).toHaveValue("")
        expect(screen.getByLabelText(/description/i)).toHaveValue("")
        expect(screen.getByLabelText(/priority/i)).toHaveValue("medium")
        expect(screen.getByLabelText(/due date/i)).toHaveValue("")
      })
    })

    it("should submit with default values for optional fields", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Minimal Task")

      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(mockCreateTask).toHaveBeenCalledWith({
          title: "Minimal Task",
          description: "",
          priority: "medium",
          dueDate: "",
        })
      })
    })
  })

  describe("Error Handling", () => {
    it("should display error message when submission fails", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({
        success: false,
        error: "Failed to create task",
      })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByText("Failed to create task")).toBeInTheDocument()
      })
    })

    it("should not call onClose when submission fails", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({
        success: false,
        error: "Error",
      })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument()
      })

      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it("should clear previous error on new submission attempt", async () => {
      const user = userEvent.setup()
      mockCreateTask
        .mockResolvedValueOnce({
          success: false,
          error: "First error",
        })
        .mockResolvedValueOnce({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByText("First error")).toBeInTheDocument()
      })

      // Try again
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.queryByText("First error")).not.toBeInTheDocument()
      })
    })
  })

  describe("Loading States", () => {
    it("should show loading text during submission", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      expect(screen.getByRole("button", { name: "Creating..." })).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Create Task" })).toBeInTheDocument()
      })
    })

    it("should disable submit button during loading", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100)
          })
      )

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      const submitButton = screen.getByRole("button", { name: "Creating..." })
      expect(submitButton).toBeDisabled()
    })

    it("should re-enable submit button after failed submission", async () => {
      const user = userEvent.setup()
      mockCreateTask.mockResolvedValue({
        success: false,
        error: "Error",
      })

      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByText("Error")).toBeInTheDocument()
      })

      expect(screen.getByRole("button", { name: "Create Task" })).not.toBeDisabled()
    })
  })

  describe("Cancel Button", () => {
    it("should call onClose when cancel button is clicked", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it("should not submit form when cancel is clicked", async () => {
      const user = userEvent.setup()
      render(<CreateTaskForm onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/title \*/i), "Test Task")
      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockCreateTask).not.toHaveBeenCalled()
    })
  })

  describe("Form Styling", () => {
    it("should render title input with correct classes", () => {
      const { container } = render(<CreateTaskForm />)
      const titleInput = container.querySelector("input[type='text']")
      expect(titleInput).toHaveClass("w-full")
      expect(titleInput).toHaveClass("px-4")
      expect(titleInput).toHaveClass("py-2")
    })

    it("should render description textarea with monospace font", () => {
      const { container } = render(<CreateTaskForm />)
      const textarea = container.querySelector("textarea")
      expect(textarea).toHaveClass("font-mono")
      expect(textarea).toHaveClass("text-sm")
    })

    it("should render form with spacing", () => {
      const { container } = render(<CreateTaskForm />)
      const form = container.querySelector("form")
      expect(form).toHaveClass("space-y-4")
    })
  })

  describe("Accessibility", () => {
    it("should have proper label associations", () => {
      render(<CreateTaskForm />)

      const titleInput = screen.getByLabelText(/title \*/i)
      expect(titleInput).toHaveAttribute("id", "title")

      const descriptionTextarea = screen.getByLabelText(/description/i)
      expect(descriptionTextarea).toHaveAttribute("id", "description")
    })

    it("should show required indicator on title label", () => {
      render(<CreateTaskForm />)
      const titleLabel = screen.getByLabelText(/title \*/i)
      expect(titleLabel).toBeInTheDocument()
    })
  })

  describe("Combinations", () => {
    it("should handle form with all fields filled and error then success", async () => {
      const user = userEvent.setup()
      mockCreateTask
        .mockResolvedValueOnce({
          success: false,
          error: "Network error",
        })
        .mockResolvedValueOnce({ success: true })

      render(<CreateTaskForm onClose={mockOnClose} />)

      // Fill all fields
      await user.type(screen.getByLabelText(/title \*/i), "Complete Task")
      await user.type(screen.getByLabelText(/description/i), "Full description")
      await user.selectOptions(screen.getByLabelText(/priority/i), "low")
      await user.type(screen.getByLabelText(/due date/i), "2024-12-25")

      // First submission fails
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument()
      })

      // Second submission succeeds
      await user.click(screen.getByRole("button", { name: "Create Task" }))

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })
  })
})
