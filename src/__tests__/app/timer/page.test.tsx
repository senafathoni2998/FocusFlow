/**
 * Unit tests for src/app/timer/page.tsx
 *
 * Tests cover:
 * - Authentication check using auth()
 * - Redirect to signin when not authenticated
 * - Redirect when session exists but user is null
 * - Rendering PomodoroTimer when authenticated
 * - Page layout and structure
 * - Styling classes
 */

import { redirect } from "next/navigation"
import { render } from "@testing-library/react"
import TimerPage from "@/app/timer/page"

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}))

// Mock @/lib/auth
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

// Mock PomodoroTimer component
jest.mock("@/components/timer/PomodoroTimer", () => {
  return function MockPomodoroTimer() {
    return <div data-testid="pomodoro-timer">PomodoroTimer</div>
  }
})

import { auth } from "@/lib/auth"
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("Timer Page", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should call auth to check session", async () => {
      mockAuth.mockResolvedValue({ user: { id: "1", name: "Test", email: "test@test.com" } } as any)

      await TimerPage()

      expect(mockAuth).toHaveBeenCalled()
    })

    it("should redirect to signin when session is null", async () => {
      mockAuth.mockResolvedValue(null)

      await TimerPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session exists but user is null", async () => {
      mockAuth.mockResolvedValue({ user: null } as any)

      await TimerPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session.user is undefined", async () => {
      mockAuth.mockResolvedValue({} as any)

      await TimerPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should not redirect when user is authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      await TimerPage()

      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe("Page Rendering", () => {
    it("should render PomodoroTimer when authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })

    it("should render main element with correct styling", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const main = container.querySelector("main")
      expect(main).toBeInTheDocument()
      expect(main).toHaveClass("min-h-screen")
      expect(main).toHaveClass("bg-gray-50")
    })

    it("should render container div with max-width", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const containerDiv = container.querySelector(".max-w-7xl")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should render container with centered layout", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const containerDiv = container.querySelector(".max-w-7xl")
      expect(containerDiv).toHaveClass("mx-auto")
    })

    it("should render container with proper padding", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const containerDiv = container.querySelector(".px-4.sm\\:px-6.lg\\:px-8.py-8")
      expect(containerDiv).toBeInTheDocument()
    })
  })

  describe("Layout Structure", () => {
    it("should have correct nesting: main > div > PomodoroTimer", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const main = container.querySelector("main")
      const innerDiv = main?.querySelector(":scope > div")
      const timer = innerDiv?.querySelector('[data-testid="pomodoro-timer"]')

      expect(main).toBeInTheDocument()
      expect(innerDiv).toBeInTheDocument()
      expect(timer).toBeInTheDocument()
    })

    it("should apply responsive padding classes", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      const containerDiv = container.querySelector(".px-4")
      expect(containerDiv).toBeInTheDocument()

      const smPx = containerDiv?.classList.contains("sm:px-6")
      const lgPx = containerDiv?.classList.contains("lg:px-8")
      expect(smPx || lgPx).toBeTruthy()
    })
  })

  describe("Full Page Integration", () => {
    it("should render complete page structure for authenticated user", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      // Check main element
      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen", "bg-gray-50")

      // Check container
      const contentDiv = container.querySelector(".max-w-7xl.mx-auto")
      expect(contentDiv).toBeInTheDocument()

      // Check PomodoroTimer
      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })

    it("should call redirect when not authenticated", async () => {
      mockAuth.mockResolvedValue(null)

      await TimerPage()

      // Should call redirect (note: in test, redirect doesn't actually throw)
      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })
  })

  describe("User Data Handling", () => {
    it("should render with user having id", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })

    it("should render with user having name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "John Doe", email: "john@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })

    it("should render with user having email", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "user@example.com" }
      } as any)

      const { container } = render(await TimerPage())

      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })

    it("should handle user with minimal properties", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1" }
      } as any)

      const { container } = render(await TimerPage())

      expect(container.querySelector('[data-testid="pomodoro-timer"]')).toBeInTheDocument()
    })
  })

  describe("Styling Classes", () => {
    it("should apply min-height screen to main", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen")
    })

    it("should apply gray-50 background to main", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      const main = container.querySelector("main")
      expect(main).toHaveClass("bg-gray-50")
    })

    it("should apply max-w-7xl to container", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      const contentDiv = container.querySelector(".max-w-7xl")
      expect(contentDiv).toBeInTheDocument()
    })

    it("should apply py-8 to container", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)

      const { container } = render(await TimerPage())

      const contentDiv = container.querySelector(".py-8")
      expect(contentDiv).toBeInTheDocument()
    })
  })
})
