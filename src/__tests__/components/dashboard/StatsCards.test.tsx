/**
 * Unit tests for src/components/dashboard/StatsCards.tsx
 *
 * Tests cover:
 * - Card rendering
 * - Icon display
 * - Value formatting
 * - Description display
 * - Color variants
 * - Grid layout
 * - Empty/zero data handling
 * - Percentage calculations
 */

import { render, screen } from "@testing-library/react"
import StatsCards from "@/components/dashboard/StatsCards"

const mockTaskStats = {
  total: 10,
  todo: 3,
  inProgress: 4,
  completed: 3,
}

const mockSessionStats = {
  total: 8,
  completed: 6,
  cancelled: 2,
  totalMinutes: 360,
}

describe("StatsCards Component", () => {
  describe("Initial Rendering", () => {
    it("should render stats cards container", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const container = document.querySelector(".grid")
      expect(container).toBeInTheDocument()
    })

    it("should render all 4 stat cards", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      expect(cards).toHaveLength(4)
    })
  })

  describe("Total Focus Time Card", () => {
    it("should render total focus time card", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Total Focus Time")).toBeInTheDocument()
    })

    it("should display clock emoji icon", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("⏱️")).toBeInTheDocument()
    })

    it("should format minutes correctly for hours and minutes", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 366 }} />)

      // 366 minutes = 6h 6m
      expect(screen.getByText("6h 6m")).toBeInTheDocument()
    })

    it("should format minutes correctly for minutes only", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 45 }} />)

      expect(screen.getByText("45m")).toBeInTheDocument()
    })

    it("should format minutes correctly for single hour", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 60 }} />)

      expect(screen.getByText("1h 0m")).toBeInTheDocument()
    })

    it("should display 'This period' description", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("This period")).toBeInTheDocument()
    })

    it("should use primary color", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      const focusTimeCard = cards[0]
      expect(focusTimeCard).toHaveClass("bg-primary-50")
      expect(focusTimeCard).toHaveClass("border-primary-200")
    })
  })

  describe("Sessions Completed Card", () => {
    it("should render sessions completed card", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Sessions Completed")).toBeInTheDocument()
    })

    it("should display checkmark emoji icon", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("✅")).toBeInTheDocument()
    })

    it("should display completed sessions count", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("6")).toBeInTheDocument()
    })

    it("should display total sessions in description", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("8 total sessions")).toBeInTheDocument()
    })

    it("should use success color", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      const sessionsCard = cards[1]
      expect(sessionsCard).toHaveClass("bg-success-50")
      expect(sessionsCard).toHaveClass("border-success-200")
    })
  })

  describe("Tasks Completed Card", () => {
    it("should render tasks completed card", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Tasks Completed")).toBeInTheDocument()
    })

    it("should display clipboard emoji icon", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("📋")).toBeInTheDocument()
    })

    it("should display completed tasks count", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("3")).toBeInTheDocument()
    })

    it("should display in-progress tasks in description", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("4 in progress")).toBeInTheDocument()
    })

    it("should use primary color", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      const tasksCard = cards[2]
      expect(tasksCard).toHaveClass("bg-primary-50")
      expect(tasksCard).toHaveClass("border-primary-200")
    })
  })

  describe("Completion Rate Card", () => {
    it("should render completion rate card", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Completion Rate")).toBeInTheDocument()
    })

    it("should display chart emoji icon", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("📊")).toBeInTheDocument()
    })

    it("should calculate completion rate percentage correctly", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      // 3 completed out of 10 total = 30%
      expect(screen.getByText("30%")).toBeInTheDocument()
    })

    it("should display 'Task completion' description", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Task completion")).toBeInTheDocument()
    })

    it("should use warning color", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      const completionCard = cards[3]
      expect(completionCard).toHaveClass("bg-warning-50")
      expect(completionCard).toHaveClass("border-warning-200")
    })
  })

  describe("Percentage Calculation", () => {
    it("should calculate 0% when no tasks completed", () => {
      const noCompleted = { ...mockTaskStats, completed: 0, total: 5 }
      render(<StatsCards taskStats={noCompleted} sessionStats={mockSessionStats} />)

      expect(screen.getByText("0%")).toBeInTheDocument()
    })

    it("should calculate 100% when all tasks completed", () => {
      const allCompleted = { ...mockTaskStats, completed: 5, total: 5 }
      render(<StatsCards taskStats={allCompleted} sessionStats={mockSessionStats} />)

      expect(screen.getByText("100%")).toBeInTheDocument()
    })

    it("should calculate 50% correctly", () => {
      const halfCompleted = { ...mockTaskStats, completed: 5, total: 10 }
      render(<StatsCards taskStats={halfCompleted} sessionStats={mockSessionStats} />)

      expect(screen.getByText("50%")).toBeInTheDocument()
    })

    it("should round percentage correctly", () => {
      const oddNumbers = { ...mockTaskStats, completed: 3, total: 7 }
      render(<StatsCards taskStats={oddNumbers} sessionStats={mockSessionStats} />)

      // 3/7 ≈ 42.857%, rounds to 43%
      expect(screen.getByText("43%")).toBeInTheDocument()
    })

    it("should show 0% when total tasks is 0", () => {
      const noTasks = { ...mockTaskStats, completed: 0, total: 0 }
      render(<StatsCards taskStats={noTasks} sessionStats={mockSessionStats} />)

      expect(screen.getByText("0%")).toBeInTheDocument()
    })
  })

  describe("Zero Data Handling", () => {
    it("should handle zero focus time", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 0 }} />)

      expect(screen.getByText("0m")).toBeInTheDocument()
    })

    it("should handle zero completed sessions", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, completed: 0, total: 0 }} />)

      const zeros = screen.getAllByText("0")
      expect(zeros.length).toBeGreaterThan(0)
    })

    it("should handle zero completed tasks", () => {
      render(<StatsCards taskStats={{ ...mockTaskStats, completed: 0 }} sessionStats={mockSessionStats} />)

      // Completion rate should be 0%
      expect(screen.getByText("0%")).toBeInTheDocument()
    })

    it("should handle zero in-progress tasks", () => {
      render(<StatsCards taskStats={{ ...mockTaskStats, inProgress: 0 }} sessionStats={mockSessionStats} />)

      expect(screen.getByText("0 in progress")).toBeInTheDocument()
    })
  })

  describe("Grid Layout", () => {
    it("should use responsive grid layout", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const grid = container.querySelector(".grid")
      expect(grid).toHaveClass("grid-cols-1")
      expect(grid).toHaveClass("sm:grid-cols-2")
      expect(grid).toHaveClass("lg:grid-cols-4")
    })

    it("should apply gap between cards", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const grid = container.querySelector(".grid")
      expect(grid).toHaveClass("gap-6")
    })
  })

  describe("Card Styling", () => {
    it("should apply base card styles", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      cards.forEach((card) => {
        expect(card).toHaveClass("bg-white")
        expect(card).toHaveClass("rounded-lg")
        expect(card).toHaveClass("shadow-sm")
        expect(card).toHaveClass("border-2")
      })
    })

    it("should apply padding to cards", () => {
      const { container } = render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg")
      cards.forEach((card) => {
        expect(card).toHaveClass("p-6")
      })
    })

    it("should render value with large font", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const valueElements = document.querySelectorAll(".text-3xl.font-bold")
      expect(valueElements).toHaveLength(4)
    })
  })

  describe("Card Content Layout", () => {
    it("should render icon and title in header row", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const headerRow = document.querySelectorAll(".flex.items-center.justify-between")
      expect(headerRow.length).toBeGreaterThanOrEqual(4)
    })

    it("should render icon with large size", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const icons = document.querySelectorAll(".text-2xl")
      expect(icons).toHaveLength(4)
    })

    it("should render title as uppercase with tracking", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Total Focus Time")).toHaveClass("text-xs")
      expect(screen.getByText("Total Focus Time")).toHaveClass("uppercase")
      expect(screen.getByText("Total Focus Time")).toHaveClass("tracking-wide")

      expect(screen.getByText("Sessions Completed")).toHaveClass("text-xs")
      expect(screen.getByText("Tasks Completed")).toHaveClass("text-xs")
      expect(screen.getByText("Completion Rate")).toHaveClass("text-xs")
    })
  })

  describe("Value Formatting", () => {
    it("should format 0 minutes as '0m'", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 0 }} />)

      expect(screen.getByText("0m")).toBeInTheDocument()
    })

    it("should format 30 minutes as '30m'", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 30 }} />)

      expect(screen.getByText("30m")).toBeInTheDocument()
    })

    it("should format 90 minutes as '1h 30m'", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 90 }} />)

      expect(screen.getByText("1h 30m")).toBeInTheDocument()
    })

    it("should format 120 minutes as '2h 0m'", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 120 }} />)

      expect(screen.getByText("2h 0m")).toBeInTheDocument()
    })

    it("should format large minute values", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={{ ...mockSessionStats, totalMinutes: 7260 }} />)

      expect(screen.getByText("121h 0m")).toBeInTheDocument()
    })
  })

  describe("Description Text", () => {
    it("should render description with gray color", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const descriptions = document.querySelectorAll(".text-sm.text-gray-600")
      expect(descriptions.length).toBe(4)
    })

    it("should show correct description for each card", () => {
      render(<StatsCards taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("This period")).toBeInTheDocument()
      expect(screen.getByText("8 total sessions")).toBeInTheDocument()
      expect(screen.getByText("4 in progress")).toBeInTheDocument()
      expect(screen.getByText("Task completion")).toBeInTheDocument()
    })
  })

  describe("Full Integration", () => {
    it("should render all cards with real-world data", () => {
      const realTaskStats = {
        total: 25,
        todo: 8,
        inProgress: 12,
        completed: 5,
      }
      const realSessionStats = {
        total: 15,
        completed: 12,
        cancelled: 3,
        totalMinutes: 540,
      }

      render(<StatsCards taskStats={realTaskStats} sessionStats={realSessionStats} />)

      expect(screen.getByText("9h 0m")).toBeInTheDocument() // 540 minutes
      expect(screen.getByText("12")).toBeInTheDocument() // completed sessions
      expect(screen.getByText("5")).toBeInTheDocument() // completed tasks
      expect(screen.getByText("20%")).toBeInTheDocument() // 5/25 = 20%
    })

    it("should handle all zero values gracefully", () => {
      const allZero = {
        total: 0,
        todo: 0,
        inProgress: 0,
        completed: 0,
      }
      const sessionsZero = {
        total: 0,
        completed: 0,
        cancelled: 0,
        totalMinutes: 0,
      }

      render(<StatsCards taskStats={allZero} sessionStats={sessionsZero} />)

      expect(screen.getByText("0m")).toBeInTheDocument()
      expect(screen.getAllByText("0").length).toBeGreaterThan(0) // "0" appears in multiple cards
      expect(screen.getByText("0%")).toBeInTheDocument()
      expect(screen.getByText("0 total sessions")).toBeInTheDocument()
    })
  })
})
