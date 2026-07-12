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
})
