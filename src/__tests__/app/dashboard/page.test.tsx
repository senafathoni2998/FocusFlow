/**
 * Unit tests for src/app/dashboard/page.tsx
 *
 * Tests cover:
 * - Authentication check using auth()
 * - Redirect to signin when not authenticated
 * - Analytics fetching via getAnalytics()
 * - Default data fallback when analytics fails
 * - Rendering StatsCards, Charts, AIInsights
 * - Welcome message with user name/email
 * - Page layout and structure
 * - Styling classes
 */

import { render, screen } from "@testing-library/react"
import DashboardPage from "@/app/dashboard/page"

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    // Mimic Next.js redirect behavior by throwing
    const error = new Error(`NEXT_REDIRECT`) as any
    error.digest = `NEXT_REDIRECT;${path}`
    throw error
  }),
}))

// Mock next/headers
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}))

// Mock @/lib/auth
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

// Mock dashboard components
jest.mock("@/components/dashboard/StatsCards", () => {
  return function MockStatsCards({ taskStats, sessionStats }: { taskStats: any; sessionStats: any }) {
    return (
      <div data-testid="stats-cards" data-tasks={taskStats?.total || 0} data-sessions={sessionStats?.total || 0}>
        StatsCards
      </div>
    )
  }
})

jest.mock("@/components/dashboard/Charts", () => {
  return function MockCharts({ dailyData, taskStats, sessionStats }: { dailyData: any; taskStats: any; sessionStats: any }) {
    return (
      <div data-testid="charts" data-daily-count={dailyData?.length || 0}>
        Charts
      </div>
    )
  }
})

jest.mock("@/components/dashboard/AIInsights", () => {
  return function MockAIInsights() {
    return <div data-testid="ai-insights">AIInsights</div>
  }
})

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockHeaders = headers as jest.MockedFunction<typeof headers>
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({
      dailyData: [{ date: "2024-01-01", tasksCompleted: 5, focusTime: 120 }],
      taskStats: { total: 10, todo: 3, inProgress: 2, completed: 5, highPriority: 1, mediumPriority: 2, lowPriority: 7 },
      sessionStats: { total: 8, completed: 6, cancelled: 2, totalMinutes: 480 },
      peakHours: [{ hour: 9, count: 3 }]
    })
  })
) as jest.MockedFunction<typeof fetch>

describe("Dashboard Page", () => {
  const mockAnalytics = {
    dailyData: [
      { date: "2024-01-01", tasksCompleted: 5, focusTime: 120 },
      { date: "2024-01-02", tasksCompleted: 3, focusTime: 90 }
    ],
    taskStats: {
      total: 10,
      todo: 3,
      inProgress: 2,
      completed: 5,
      highPriority: 1,
      mediumPriority: 2,
      lowPriority: 7
    },
    sessionStats: {
      total: 8,
      completed: 6,
      cancelled: 2,
      totalMinutes: 480
    },
    peakHours: [
      { hour: 9, count: 3 },
      { hour: 10, count: 2 }
    ]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Setup default headers mock
    mockHeaders.mockResolvedValue({
      get: jest.fn(() => null)
    } as any)
  })

  describe("Authentication", () => {
    it("should call auth to check session", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      await DashboardPage()

      expect(mockAuth).toHaveBeenCalled()
    })

    it("should redirect to signin when session is null", async () => {
      mockAuth.mockResolvedValue(null)

      await expect(DashboardPage()).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session exists but user is null", async () => {
      mockAuth.mockResolvedValue({ user: null } as any)

      await expect(DashboardPage()).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session.user is undefined", async () => {
      mockAuth.mockResolvedValue({} as any)

      await expect(DashboardPage()).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should not redirect when user is authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      await DashboardPage()

      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe("Analytics Fetching", () => {
    it("should call headers to get request headers", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      await DashboardPage()

      expect(mockHeaders).toHaveBeenCalled()
    })

    it("should fetch analytics when authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      await DashboardPage()

      expect(global.fetch).toHaveBeenCalled()
    })

    it("should fetch from correct analytics endpoint", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      await DashboardPage()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/analytics"),
        expect.objectContaining({
          cache: "no-store"
        })
      )
    })

    it("should include days=30 query parameter", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      await DashboardPage()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("days=30"),
        expect.any(Object)
      )
    })

    it("should handle fetch error gracefully", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(new Error("Network error"))

      const { container } = render(await DashboardPage())

      // Should still render with default data
      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
    })

    it("should handle non-ok response gracefully", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500
      } as any)

      const { container } = render(await DashboardPage())

      // Should still render with default data
      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
    })
  })

  describe("Default Data Fallback", () => {
    it("should use default data when analytics is null", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500
      } as any)

      const { container } = render(await DashboardPage())

      const statsCards = container.querySelector('[data-testid="stats-cards"]')
      expect(statsCards?.getAttribute("data-tasks")).toBe("0")
      expect(statsCards?.getAttribute("data-sessions")).toBe("0")
    })

    it("should use default data when analytics fetch returns null", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => null
      } as any)

      const { container } = render(await DashboardPage())

      const statsCards = container.querySelector('[data-testid="stats-cards"]')
      expect(statsCards?.getAttribute("data-tasks")).toBe("0")
    })
  })

  describe("Welcome Message", () => {
    it("should display welcome message with user name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "John Doe", email: "john@example.com" }
      } as any)

      render(await DashboardPage())

      expect(screen.getByText("Welcome back, John Doe!")).toBeInTheDocument()
    })

    it("should display welcome message with user email when name is missing", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: null, email: "user@example.com" }
      } as any)

      render(await DashboardPage())

      expect(screen.getByText(/Welcome back, user@example.com/)).toBeInTheDocument()
    })

    it("should display productivity overview text", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      render(await DashboardPage())

      expect(screen.getByText("Here's your productivity overview")).toBeInTheDocument()
    })

    it("should have correct heading styles", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const heading = container.querySelector("h1")
      expect(heading).toHaveClass("text-3xl", "font-bold", "text-gray-900")
    })
  })

  describe("Dashboard Components", () => {
    it("should render StatsCards component", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
    })

    it("should render Charts component", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      expect(container.querySelector('[data-testid="charts"]')).toBeInTheDocument()
    })

    it("should render AIInsights component", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      expect(container.querySelector('[data-testid="ai-insights"]')).toBeInTheDocument()
    })

    it("should pass taskStats to StatsCards", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      const statsCards = container.querySelector('[data-testid="stats-cards"]')
      expect(statsCards?.getAttribute("data-tasks")).toBe("10")
    })

    it("should pass sessionStats to StatsCards", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      const statsCards = container.querySelector('[data-testid="stats-cards"]')
      expect(statsCards?.getAttribute("data-sessions")).toBe("8")
    })

    it("should pass dailyData to Charts", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      const charts = container.querySelector('[data-testid="charts"]')
      expect(charts?.getAttribute("data-daily-count")).toBe("2")
    })
  })

  describe("Page Layout", () => {
    it("should render main element with correct styling", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen", "bg-gray-50")
    })

    it("should render container div with max-width", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const containerDiv = container.querySelector(".max-w-7xl")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should render container with centered layout", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const containerDiv = container.querySelector(".max-w-7xl.mx-auto")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should render welcome section with margin bottom", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const welcomeSection = container.querySelector(".mb-8")
      expect(welcomeSection).toBeInTheDocument()
    })
  })

  describe("Grid Layout", () => {
    it("should render charts and insights in grid layout", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const grid = container.querySelector(".grid.grid-cols-1.lg\\:grid-cols-3")
      expect(grid).toBeInTheDocument()
    })

    it("should have correct column spans for charts", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const chartsContainer = container.querySelector(".lg\\:col-span-2")
      expect(chartsContainer).toBeInTheDocument()
    })

    it("should have correct column spans for AI insights", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const insightsContainer = container.querySelector(".lg\\:col-span-1")
      expect(insightsContainer).toBeInTheDocument()
    })

    it("should have gap between grid items", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const grid = container.querySelector(".gap-6")
      expect(grid).toBeInTheDocument()
    })
  })

  describe("User Data Handling", () => {
    it("should render with user having id", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
    })

    it("should render with user having name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "John Doe", email: "john@test.com" }
      } as any)

      render(await DashboardPage())

      expect(screen.getByText("Welcome back, John Doe!")).toBeInTheDocument()
    })

    it("should render with user having email", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: null, email: "user@example.com" }
      } as any)

      render(await DashboardPage())

      expect(screen.getByText(/user@example.com/)).toBeInTheDocument()
    })

    it("should handle user with name and email", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Full Name", email: "full@example.com" }
      } as any)

      const { container } = render(await DashboardPage())

      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
      expect(screen.getByText("Welcome back, Full Name!")).toBeInTheDocument()
    })
  })

  describe("Full Page Integration", () => {
    it("should render complete page structure for authenticated user", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalytics
      } as any)

      const { container } = render(await DashboardPage())

      // Check main element
      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen", "bg-gray-50")

      // Check container
      const contentDiv = container.querySelector(".max-w-7xl.mx-auto")
      expect(contentDiv).toBeInTheDocument()

      // Check welcome message
      expect(screen.getByText("Welcome back, Test User!")).toBeInTheDocument()

      // Check components
      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="charts"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="ai-insights"]')).toBeInTheDocument()
    })

    it("should render with default data when analytics fails", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(new Error("Network error"))

      const { container } = render(await DashboardPage())

      // Should still render all components
      expect(container.querySelector('[data-testid="stats-cards"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="charts"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="ai-insights"]')).toBeInTheDocument()
    })
  })

  describe("Subsection Text", () => {
    it("should render description text with correct color", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const description = container.querySelector(".text-gray-600")
      expect(description).toBeInTheDocument()
    })

    it("should render description with margin top", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await DashboardPage())

      const description = container.querySelector(".mt-1")
      expect(description).toBeInTheDocument()
    })
  })
})
