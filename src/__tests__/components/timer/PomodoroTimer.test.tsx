/**
 * Unit tests for src/components/timer/PomodoroTimer.tsx
 *
 * Tests cover:
 * - Timer rendering
 * - Timer controls (start, pause, resume, reset)
 * - Task selector
 * - Timer display and formatting
 * - Progress ring
 * - Server action integration
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import PomodoroTimer from "@/components/timer/PomodoroTimer"

// Mock server actions
jest.mock("@/app/actions/sessions", () => ({
  startSession: jest.fn(),
  completeSession: jest.fn(),
  cancelSession: jest.fn(),
}))

jest.mock("@/app/actions/tasks", () => ({
  getTasks: jest.fn(),
}))

// Mock AudioContext for sound notification
const mockFrequency = { value: 0 }
const mockOscillator = {
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  frequency: mockFrequency,
  type: "",
}

const mockGainNode = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  },
}

const mockAudioContext = {
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGainNode),
  destination: {},
  get currentTime() { return 0 },
}

global.AudioContext = jest.fn(() => mockAudioContext) as any
;(window as any).AudioContext = jest.fn(() => mockAudioContext)

describe("PomodoroTimer Component", () => {
  let mockStartSession: jest.Mock
  let mockCompleteSession: jest.Mock
  let mockCancelSession: jest.Mock
  let mockGetTasks: jest.Mock
  const originalConfirm = global.confirm

  beforeEach(() => {
    jest.clearAllMocks()

    global.confirm = originalConfirm

    mockFrequency.value = 0
    mockOscillator.type = ""

    mockStartSession = require("@/app/actions/sessions").startSession
    mockCompleteSession = require("@/app/actions/sessions").completeSession
    mockCancelSession = require("@/app/actions/sessions").cancelSession
    mockGetTasks = require("@/app/actions/tasks").getTasks

    mockGetTasks.mockResolvedValue([
      { id: "1", title: "Task 1", status: "todo" },
      { id: "2", title: "Task 2", status: "in-progress" },
    ])
  })

  afterEach(() => {
    global.confirm = originalConfirm
  })

  describe("Initial Rendering", () => {
    it("should render timer component", () => {
      render(<PomodoroTimer />)
      expect(screen.getByText("Focus Time")).toBeInTheDocument()
    })

    it("should render timer type selector buttons", () => {
      render(<PomodoroTimer />)
      expect(screen.getByRole("button", { name: "Focus" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Short Break" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Long Break" })).toBeInTheDocument()
    })

    it("should render start button initially", () => {
      render(<PomodoroTimer />)
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
    })

    it("should display initial time as 25:00 for pomodoro", () => {
      render(<PomodoroTimer />)
      expect(screen.getByText("25:00")).toBeInTheDocument()
    })

    it("should render task selector label", () => {
      render(<PomodoroTimer />)
      expect(screen.getByText("Associated Task (Optional)")).toBeInTheDocument()
    })

    it("should render task selector with no task option", () => {
      render(<PomodoroTimer />)
      expect(screen.getByRole("option", { name: "No task selected" })).toBeInTheDocument()
    })
  })

  describe("Timer Types", () => {
    it("should show pomodoro type as active by default", () => {
      const { container } = render(<PomodoroTimer />)
      const focusButton = screen.getByRole("button", { name: "Focus" })
      expect(focusButton).toHaveClass("bg-primary-600")
      expect(focusButton).toHaveClass("text-white")
    })

    it("should highlight active timer type", async () => {
      const user = userEvent.setup({ delay: null })
      const { container } = render(<PomodoroTimer />)

      const shortBreakButton = screen.getByRole("button", { name: "Short Break" })

      await user.click(shortBreakButton)

      // Button should have active styles
      await waitFor(
        () => {
          expect(shortBreakButton).toHaveClass("bg-success-600")
          expect(shortBreakButton).toHaveClass("text-white")
        },
        { timeout: 3000 }
      )
    })
  })

  describe("Timer Start", () => {
    it("should start timer when start button is clicked", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith(null, "pomodoro", 1500)
      })

      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument()
    })

    it("should show pause and reset buttons when running", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument()
      })
    })

    it("should disable task selector when timer is running", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        const select = screen.getByRole("combobox")
        expect(select).toBeDisabled()
      })
    })

    it("should not start when session start fails", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: false,
        error: "Failed to start",
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      // Start button should remain
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
      })
    })
  })

  describe("Timer Pause", () => {
    it("should pause timer when pause button is clicked", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: "Pause" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument()
      })
    })
  })

  describe("Timer Resume", () => {
    it("should resume timer when resume button is clicked", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))
      await user.click(screen.getByRole("button", { name: "Pause" }))
      await user.click(screen.getByRole("button", { name: "Resume" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
      })
    })
  })

  describe("Timer Reset", () => {
    it("should reset timer when running", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })
      mockCancelSession.mockResolvedValue({ success: true })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))
      await user.click(screen.getByRole("button", { name: "Reset" }))

      await waitFor(() => {
        expect(mockCancelSession).toHaveBeenCalledWith("session-1")
        expect(screen.getByText("25:00")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
      })
    })

    it("should reset timer when paused", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })
      mockCancelSession.mockResolvedValue({ success: true })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))
      await user.click(screen.getByRole("button", { name: "Pause" }))
      await user.click(screen.getByRole("button", { name: "Reset" }))

      await waitFor(() => {
        expect(screen.getByText("25:00")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
      })
    })

    it("should re-enable task selector after reset", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })
      mockCancelSession.mockResolvedValue({ success: true })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))
      await user.click(screen.getByRole("button", { name: "Reset" }))

      await waitFor(() => {
        const select = screen.getByRole("combobox")
        expect(select).not.toBeDisabled()
      })
    })
  })

  describe("Task Selection", () => {
    it("should load tasks on mount", async () => {
      render(<PomodoroTimer />)

      await waitFor(() => {
        expect(mockGetTasks).toHaveBeenCalled()
      })
    })

    it("should display available tasks in selector", async () => {
      render(<PomodoroTimer />)

      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Task 1" })).toBeInTheDocument()
        expect(screen.getByRole("option", { name: "Task 2" })).toBeInTheDocument()
      })
    })

    it("should filter out completed tasks", async () => {
      mockGetTasks.mockResolvedValue([
        { id: "1", title: "Active Task", status: "todo" },
        { id: "2", title: "Completed Task", status: "completed" },
      ])

      render(<PomodoroTimer />)

      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Active Task" })).toBeInTheDocument()
        expect(screen.queryByRole("option", { name: "Completed Task" })).not.toBeInTheDocument()
      })
    })

    it("should allow selecting a task", async () => {
      const user = userEvent.setup({ delay: null })
      render(<PomodoroTimer />)

      // Wait for tasks to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Task 1" })).toBeInTheDocument()
      })

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "1")

      expect(select).toHaveValue("1")
    })

    it("should start session with selected task", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      render(<PomodoroTimer />)

      // Wait for tasks to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Task 1" })).toBeInTheDocument()
      })

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "1")
      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith("1", "pomodoro", 1500)
      })
    })

    it("should handle empty task list gracefully", async () => {
      mockGetTasks.mockResolvedValue([])

      render(<PomodoroTimer />)

      // Should still render correctly
      expect(screen.getByText("Focus Time")).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "No task selected" })).toBeInTheDocument()
    })
  })

  describe("Timer Type Switching", () => {
    it("should show confirmation when switching while running", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: true,
        session: { id: "session-1" },
      })

      global.confirm = jest.fn(() => false)

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: "Short Break" }))

      expect(global.confirm).toHaveBeenCalledWith("Timer is running. Switch anyway?")
    })
  })

  describe("Progress Ring", () => {
    it("should render progress ring SVG", () => {
      const { container } = render(<PomodoroTimer />)
      const svg = container.querySelector("svg")
      expect(svg).toBeInTheDocument()
    })

    it("should render two circles for progress ring", () => {
      const { container } = render(<PomodoroTimer />)
      const circles = container.querySelectorAll("circle")
      expect(circles.length).toBe(2)
    })
  })

  describe("Error Handling", () => {
    it("should handle start session failure gracefully", async () => {
      const user = userEvent.setup({ delay: null })
      mockStartSession.mockResolvedValue({
        success: false,
        error: "Failed to start session",
      })

      render(<PomodoroTimer />)

      await user.click(screen.getByRole("button", { name: "Start" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
      })
    })
  })
})
