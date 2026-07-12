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
  createTask: jest.fn().mockResolvedValue({ success: true }),
  deleteTask: jest.fn().mockResolvedValue({ success: true }),
}))

// EditTaskForm fetches lists + goal options on mount for its dropdowns.
jest.mock("@/app/actions/lists", () => ({
  getLists: jest.fn().mockResolvedValue([]),
}))
jest.mock("@/app/actions/goals", () => ({
  getGoalOptions: jest.fn().mockResolvedValue([]),
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
          listId: null,
          goalId: null,
          tags: [],
          reminders: [],
          recurrence: null,
          timeEstimateMin: null,
          estimatedPomos: null,
        })
      })
      // Let the async handler finish (onUpdate -> onClose) so its trailing calls
      // don't leak into a later test under parallel load.
      await waitFor(() => expect(mockOnClose).toHaveBeenCalled())
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
          listId: null,
          goalId: null,
          tags: [],
          reminders: [],
          recurrence: null,
          timeEstimateMin: null,
          estimatedPomos: null,
        })
      })
      await waitFor(() => expect(mockOnClose).toHaveBeenCalled())
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
      // Local mock: immune to any trailing async onUpdate leaked by a prior test
      // that wrote the shared mockOnUpdate (cancel itself never calls onUpdate).
      const onUpdate = jest.fn()
      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={onUpdate} />)

      await user.click(screen.getByRole("button", { name: "Cancel" }))

      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(onUpdate).not.toHaveBeenCalled()
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
      // Target the title input specifically (the AI instruction box is also a
      // text input and now precedes it in the form).
      const titleInput = container.querySelector("#edit-title")
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

  describe("Subtasks", () => {
    it("renders existing subtasks and toggles completion", async () => {
      render(
        <EditTaskForm
          task={mockTask}
          subtasks={[{ id: "s1", title: "Sub A", status: "todo" }] as any}
        />
      )
      expect(screen.getByText("Sub A")).toBeInTheDocument()
      await userEvent.click(screen.getByLabelText("Complete subtask Sub A"))
      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith("s1", { status: "completed" })
      )
    })

    it("adds a subtask via the input", async () => {
      const createTask = require("@/app/actions/tasks").createTask
      render(<EditTaskForm task={mockTask} />)
      await userEvent.type(screen.getByLabelText("Add a subtask"), "New sub")
      await userEvent.click(screen.getByRole("button", { name: "Add" }))
      await waitFor(() =>
        expect(createTask).toHaveBeenCalledWith(
          expect.objectContaining({ title: "New sub", parentTaskId: "task-1" })
        )
      )
    })

    it("deletes a subtask", async () => {
      const deleteTask = require("@/app/actions/tasks").deleteTask
      render(
        <EditTaskForm
          task={mockTask}
          subtasks={[{ id: "s1", title: "Sub A", status: "todo" }] as any}
        />
      )
      await userEvent.click(screen.getByLabelText("Delete subtask Sub A"))
      await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("s1"))
    })
  })

  describe('"Tell AI what to change" box', () => {
    const mockFetch = (payload: any, ok = true, status = 200) => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok,
        status,
        json: async () => payload,
      })
    }

    it("renders the AI instruction box", () => {
      render(<EditTaskForm task={mockTask} />)
      expect(screen.getByLabelText(/tell ai what to change/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument()
    })

    it("posts the instruction and pre-fills the returned fields for review", async () => {
      mockFetch({ changes: { priority: "low", dueDate: "2026-08-01" } })
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(
        screen.getByLabelText(/tell ai what to change/i),
        "make it low priority due aug 1",
      )
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/ai/task-edit",
          expect.objectContaining({ method: "POST" }),
        ),
      )
      // The request carries the task id + instruction.
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body).toEqual({ taskId: "task-1", instruction: "make it low priority due aug 1" })

      // Fields are pre-filled (not yet saved) and a review note is shown.
      expect(screen.getByLabelText(/priority/i)).toHaveValue("low")
      expect(screen.getByLabelText(/due date/i)).toHaveValue("2026-08-01")
      expect(screen.getByText(/AI updated: Priority, Due date/i)).toBeInTheDocument()
    })

    it("does NOT save automatically — updateTask only runs on the normal Save", async () => {
      mockFetch({ changes: { priority: "low" } })
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "low priority")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() => expect(screen.getByLabelText(/priority/i)).toHaveValue("low"))
      expect(mockUpdateTask).not.toHaveBeenCalled()

      // The pre-filled value is what gets persisted when the user hits Save.
      mockUpdateTask.mockResolvedValue({ success: true })
      await userEvent.click(screen.getByRole("button", { name: /save changes/i }))
      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          "task-1",
          expect.objectContaining({ priority: "low" }),
        ),
      )
    })

    it("surfaces an error and leaves fields unchanged when the AI call fails", async () => {
      mockFetch({ error: "no", message: "Try rephrasing." }, false, 500)
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "gibberish")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() => expect(screen.getByText("Try rephrasing.")).toBeInTheDocument())
      // Priority stayed at the task's original value.
      expect(screen.getByLabelText(/priority/i)).toHaveValue("high")
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it("tells the user when the AI found nothing to change", async () => {
      mockFetch({ changes: {} })
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "hello")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() =>
        expect(screen.getByText(/didn't find anything to change/i)).toBeInTheDocument(),
      )
    })

    it("Enter runs the AI edit — it must NOT submit/close the form", async () => {
      mockFetch({ changes: { priority: "low" } })
      render(<EditTaskForm task={mockTask} onClose={mockOnClose} onUpdate={mockOnUpdate} />)

      // Typing an instruction ending in Enter must trigger the AI call, not a form submit.
      await userEvent.type(
        screen.getByLabelText(/tell ai what to change/i),
        "make it low{Enter}",
      )

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith("/api/ai/task-edit", expect.anything()),
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it("leaves the task's existing reminders intact through an AI edit + Save", async () => {
      mockFetch({ changes: { priority: "low" } })
      const taskWithReminder = {
        ...mockTask,
        reminders: [{ id: "r1", triggerAt: new Date(2026, 7, 1, 9, 0) }],
      }
      render(<EditTaskForm task={taskWithReminder as any} onClose={mockOnClose} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "low priority")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))
      await waitFor(() => expect(screen.getByLabelText(/priority/i)).toHaveValue("low"))

      mockUpdateTask.mockResolvedValue({ success: true })
      await userEvent.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          "task-1",
          expect.objectContaining({ priority: "low", reminders: ["2026-08-01T09:00"] }),
        ),
      )
    })

    it("shows removed tags explicitly so a partial AI reply can't silently drop them", async () => {
      mockFetch({ changes: { tags: ["billing"] } })
      const taskWithTags = {
        ...mockTask,
        tags: [{ name: "work" }, { name: "urgent" }],
      }
      render(<EditTaskForm task={taskWithTags as any} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "add billing tag")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() =>
        expect(screen.getByText(/removed: work, urgent/i)).toBeInTheDocument(),
      )
      expect(screen.getByLabelText(/tags/i)).toHaveValue("billing")
    })

    it("shows a Thinking… disabled state while the request is in flight", async () => {
      let resolveFetch: (v: any) => void = () => {}
      ;(global.fetch as jest.Mock).mockReturnValue(
        new Promise((r) => {
          resolveFetch = r
        }),
      )
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "x")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      const thinking = screen.getByRole("button", { name: /thinking/i })
      expect(thinking).toBeDisabled()
      expect(screen.getByLabelText(/tell ai what to change/i)).toBeDisabled()

      resolveFetch({ ok: true, json: async () => ({ changes: {} }) })
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument(),
      )
    })

    it("surfaces a network failure and leaves fields + updateTask untouched", async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error("network down"))
      render(<EditTaskForm task={mockTask} />)

      await userEvent.type(screen.getByLabelText(/tell ai what to change/i), "do it")
      await userEvent.click(screen.getByRole("button", { name: "Apply" }))

      await waitFor(() =>
        expect(screen.getByText(/couldn't reach the ai/i)).toBeInTheDocument(),
      )
      expect(screen.getByLabelText(/priority/i)).toHaveValue("high")
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  describe("AI subtask suggestions", () => {
    const mockCreateTask = require("@/app/actions/tasks").createTask as jest.Mock

    const mockFetch = (data: any, ok = true) => {
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok, json: async () => data })
    }

    it("renders a Suggest button in the subtasks section", () => {
      render(<EditTaskForm task={mockTask} />)
      expect(screen.getByRole("button", { name: /suggest/i })).toBeInTheDocument()
    })

    it("fetches suggestions and shows them as a checklist (all checked)", async () => {
      mockFetch({ subtasks: ["Draft outline", "Write intro", "Publish"] })
      render(<EditTaskForm task={mockTask} />)

      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/ai/subtasks",
          expect.objectContaining({ method: "POST" }),
        ),
      )
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(body).toEqual({ taskId: "task-1" })

      expect(screen.getByLabelText("Include subtask Draft outline")).toBeChecked()
      expect(screen.getByRole("button", { name: /add 3 selected/i })).toBeInTheDocument()
    })

    it("creates only the checked suggestions as subtasks, then clears them", async () => {
      const onUpdate = jest.fn()
      mockFetch({ subtasks: ["Draft outline", "Write intro", "Publish"] })
      render(<EditTaskForm task={mockTask} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask Write intro")

      // Uncheck the middle one.
      await userEvent.click(screen.getByLabelText("Include subtask Write intro"))
      expect(screen.getByRole("button", { name: /add 2 selected/i })).toBeInTheDocument()

      await userEvent.click(screen.getByRole("button", { name: /add 2 selected/i }))

      await waitFor(() => expect(mockCreateTask).toHaveBeenCalledTimes(2))
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Draft outline", parentTaskId: "task-1" }),
      )
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Publish", parentTaskId: "task-1" }),
      )
      expect(mockCreateTask).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "Write intro" }),
      )
      // The suggestion panel is cleared and the parent refreshes.
      await waitFor(() =>
        expect(screen.queryByText("Draft outline")).not.toBeInTheDocument(),
      )
      expect(onUpdate).toHaveBeenCalled()
    })

    it("shows a message when the AI returns no subtasks", async () => {
      mockFetch({ subtasks: [] })
      render(<EditTaskForm task={mockTask} />)
      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      expect(await screen.findByText(/didn't come up with any subtasks/i)).toBeInTheDocument()
    })

    it("surfaces an error and creates nothing when the request fails", async () => {
      mockFetch({ error: "AI service not configured", message: "No AI provider is configured." }, false)
      render(<EditTaskForm task={mockTask} />)
      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      expect(await screen.findByText("No AI provider is configured.")).toBeInTheDocument()
      expect(mockCreateTask).not.toHaveBeenCalled()
    })

    it("surfaces createTask's {error} return and does NOT clear the checklist", async () => {
      const onUpdate = jest.fn()
      mockFetch({ subtasks: ["A", "B"] })
      // createTask returns an error object (it does not throw).
      mockCreateTask.mockResolvedValue({ error: "List not found" })
      render(<EditTaskForm task={mockTask} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask A")
      await userEvent.click(screen.getByRole("button", { name: /add 2 selected/i }))

      expect(await screen.findByText(/list not found/i)).toBeInTheDocument()
      // Nothing succeeded → the checklist stays and the parent is not refreshed.
      expect(screen.getByLabelText("Include subtask A")).toBeInTheDocument()
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it("on a mid-loop failure keeps only the uncreated items (no re-create on retry)", async () => {
      const onUpdate = jest.fn()
      mockFetch({ subtasks: ["A", "B", "C"] })
      mockCreateTask
        .mockResolvedValueOnce({ success: true }) // A created
        .mockRejectedValueOnce(new Error("boom")) // B fails
      render(<EditTaskForm task={mockTask} onUpdate={onUpdate} />)

      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask A")
      await userEvent.click(screen.getByRole("button", { name: /add 3 selected/i }))

      // The created one is dropped from the list; the rest remain for retry.
      await waitFor(() =>
        expect(screen.queryByLabelText("Include subtask A")).not.toBeInTheDocument(),
      )
      expect(screen.getByLabelText("Include subtask B")).toBeInTheDocument()
      expect(screen.getByText(/Added 1, but couldn't add the rest/i)).toBeInTheDocument()
      // Committed row is surfaced via a refresh.
      expect(onUpdate).toHaveBeenCalled()
    })

    it("Dismiss clears the checklist without creating anything", async () => {
      mockFetch({ subtasks: ["A", "B"] })
      render(<EditTaskForm task={mockTask} />)
      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask A")

      await userEvent.click(screen.getByRole("button", { name: /dismiss/i }))
      expect(screen.queryByLabelText("Include subtask A")).not.toBeInTheDocument()
      expect(mockCreateTask).not.toHaveBeenCalled()
    })

    it("disables 'Add' when every suggestion is unchecked", async () => {
      mockFetch({ subtasks: ["A", "B"] })
      render(<EditTaskForm task={mockTask} />)
      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask A")

      await userEvent.click(screen.getByLabelText("Include subtask A"))
      await userEvent.click(screen.getByLabelText("Include subtask B"))
      expect(screen.getByRole("button", { name: /add 0 selected/i })).toBeDisabled()
    })

    it("shows an 'Adding…' busy state while creating", async () => {
      mockFetch({ subtasks: ["A"] })
      let resolveCreate: (v: any) => void = () => {}
      mockCreateTask.mockReturnValue(new Promise((r) => { resolveCreate = r }))
      render(<EditTaskForm task={mockTask} />)

      await userEvent.click(screen.getByRole("button", { name: /suggest/i }))
      await screen.findByLabelText("Include subtask A")
      await userEvent.click(screen.getByRole("button", { name: /add 1 selected/i }))

      expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled()
      resolveCreate({ success: true })
      await waitFor(() =>
        expect(screen.queryByLabelText("Include subtask A")).not.toBeInTheDocument(),
      )
    })
  })

  describe("Time estimate + tracked time", () => {
    it("shows the estimate-vs-actual readout when time is tracked", () => {
      render(<EditTaskForm task={{ ...mockTask, timeEstimateMin: 60, actualMin: 75 }} />)
      expect(screen.getByText(/Time tracked:/i)).toBeInTheDocument()
      expect(screen.getByText(/over by/i)).toBeInTheDocument()
    })

    it("hides the readout when no time is tracked", () => {
      render(<EditTaskForm task={mockTask} />)
      expect(screen.queryByText(/Time tracked:/i)).not.toBeInTheDocument()
    })

    it("submits the parsed time estimate on save", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })
      render(<EditTaskForm task={mockTask} />)

      await user.type(screen.getByLabelText(/time estimate/i), "45")
      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          "task-1",
          expect.objectContaining({ timeEstimateMin: 45 }),
        ),
      )
    })

    it("shows 'on target' when actual equals the estimate", () => {
      render(<EditTaskForm task={{ ...mockTask, timeEstimateMin: 60, actualMin: 60 }} />)
      expect(screen.getByText(/on target/i)).toBeInTheDocument()
    })

    it("updates the over/under verdict live as the estimate is edited", async () => {
      const user = userEvent.setup()
      render(<EditTaskForm task={{ ...mockTask, timeEstimateMin: 30, actualMin: 60 }} />)
      expect(screen.getByText(/over by/i)).toBeInTheDocument()

      const est = screen.getByLabelText(/time estimate/i)
      await user.clear(est)
      await user.type(est, "90")
      expect(screen.getByText(/under by/i)).toBeInTheDocument()
    })

    it("sends null to clear a previously-set estimate on save", async () => {
      const user = userEvent.setup()
      mockUpdateTask.mockResolvedValue({ success: true })
      render(<EditTaskForm task={{ ...mockTask, timeEstimateMin: 60 }} />)

      await user.clear(screen.getByLabelText(/time estimate/i))
      await user.click(screen.getByRole("button", { name: "Save Changes" }))

      await waitFor(() =>
        expect(mockUpdateTask).toHaveBeenCalledWith(
          "task-1",
          expect.objectContaining({ timeEstimateMin: null }),
        ),
      )
    })
  })
})
