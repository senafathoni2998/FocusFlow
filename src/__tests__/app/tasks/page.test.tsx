/**
 * Unit tests for src/app/tasks/page.tsx
 *
 * Tests cover:
 * - Authentication check using auth()
 * - Redirect to signin when not authenticated
 * - Fetching tasks using getTasks()
 * - Rendering TaskBoard when authenticated
 * - Passing tasks to TaskBoard
 * - Page layout and structure
 * - Styling classes
 */

import { redirect } from "next/navigation"
import { render } from "@testing-library/react"
import TasksPage from "@/app/tasks/page"

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}))

// Mock @/lib/auth
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

// Mock @/app/actions/tasks
jest.mock("@/app/actions/tasks", () => ({
  getTasks: jest.fn(),
}))

// Mock TaskBoard component
jest.mock("@/components/tasks/TaskBoard", () => {
  return function MockTaskBoard({ tasks }: { tasks: any[] }) {
    return (
      <div data-testid="task-board" data-tasks-count={tasks?.length || 0}>
        TaskBoard
      </div>
    )
  }
})

import { auth } from "@/lib/auth"
import { getTasks } from "@/app/actions/tasks"
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>
const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockGetTasks = getTasks as jest.MockedFunction<typeof getTasks>

describe("Tasks Page", () => {
  const mockTasks = [
    { id: "1", title: "Task 1", status: "todo", priority: "high" },
    { id: "2", title: "Task 2", status: "in-progress", priority: "medium" },
    { id: "3", title: "Task 3", status: "done", priority: "low" },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should call auth to check session", async () => {
      mockAuth.mockResolvedValue({ user: { id: "1", name: "Test", email: "test@test.com" } } as any)
      mockGetTasks.mockResolvedValue([])

      await TasksPage()

      expect(mockAuth).toHaveBeenCalled()
    })

    it("should redirect to signin when session is null", async () => {
      mockAuth.mockResolvedValue(null)

      await TasksPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session exists but user is null", async () => {
      mockAuth.mockResolvedValue({ user: null } as any)

      await TasksPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should redirect to signin when session.user is undefined", async () => {
      mockAuth.mockResolvedValue({} as any)

      await TasksPage()

      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should not redirect when user is authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      await TasksPage()

      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe("Tasks Fetching", () => {
    it("should call getTasks when user is authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      await TasksPage()

      expect(mockGetTasks).toHaveBeenCalled()
    })

    it("should call getTasks without userId parameter", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      await TasksPage()

      expect(mockGetTasks).toHaveBeenCalledWith()
    })

    it("should call redirect when not authenticated", async () => {
      mockAuth.mockResolvedValue(null)

      await TasksPage()

      // Should call redirect (note: in test, redirect doesn't actually throw)
      expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    })

    it("should fetch tasks for authenticated user", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue(mockTasks)

      await TasksPage()

      expect(mockGetTasks).toHaveBeenCalledWith()
    })
  })

  describe("Page Rendering", () => {
    it("should render TaskBoard when authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })

    it("should render main element with correct styling", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const main = container.querySelector("main")
      expect(main).toBeInTheDocument()
      expect(main).toHaveClass("min-h-screen")
      expect(main).toHaveClass("bg-gray-50")
    })

    it("should render container div with max-width", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const containerDiv = container.querySelector(".max-w-7xl")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should render container with centered layout", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const containerDiv = container.querySelector(".max-w-7xl")
      expect(containerDiv).toHaveClass("mx-auto")
    })

    it("should render container with proper padding", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const containerDiv = container.querySelector(".px-4.sm\\:px-6.lg\\:px-8.py-8")
      expect(containerDiv).toBeInTheDocument()
    })
  })

  describe("TaskBoard Props", () => {
    it("should pass fetched tasks to TaskBoard", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue(mockTasks)

      const { container } = render(await TasksPage())

      const taskBoard = container.querySelector('[data-testid="task-board"]')
      expect(taskBoard?.getAttribute("data-tasks-count")).toBe("3")
    })

    it("should pass empty array to TaskBoard when no tasks", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const taskBoard = container.querySelector('[data-testid="task-board"]')
      expect(taskBoard?.getAttribute("data-tasks-count")).toBe("0")
    })

    it("should handle single task", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([{ id: "1", title: "Single Task", status: "todo" }])

      const { container } = render(await TasksPage())

      const taskBoard = container.querySelector('[data-testid="task-board"]')
      expect(taskBoard?.getAttribute("data-tasks-count")).toBe("1")
    })

    it("should handle many tasks", async () => {
      const manyTasks = Array.from({ length: 50 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: "todo"
      }))

      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue(manyTasks)

      const { container } = render(await TasksPage())

      const taskBoard = container.querySelector('[data-testid="task-board"]')
      expect(taskBoard?.getAttribute("data-tasks-count")).toBe("50")
    })
  })

  describe("Layout Structure", () => {
    it("should have correct nesting: main > div > TaskBoard", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const main = container.querySelector("main")
      const innerDiv = main?.querySelector(":scope > div")
      const taskBoard = innerDiv?.querySelector('[data-testid="task-board"]')

      expect(main).toBeInTheDocument()
      expect(innerDiv).toBeInTheDocument()
      expect(taskBoard).toBeInTheDocument()
    })

    it("should apply responsive padding classes", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

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
      mockGetTasks.mockResolvedValue(mockTasks)

      const { container } = render(await TasksPage())

      // Check main element
      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen", "bg-gray-50")

      // Check container
      const contentDiv = container.querySelector(".max-w-7xl.mx-auto")
      expect(contentDiv).toBeInTheDocument()

      // Check TaskBoard
      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })

    it("should render with tasks when authenticated", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue(mockTasks)

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="task-board"]')?.getAttribute("data-tasks-count")).toBe("3")
    })
  })

  describe("User Data Handling", () => {
    it("should render with user having id", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })

    it("should render with user having name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "John Doe", email: "john@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })

    it("should render with user having email", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "user@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })

    it("should handle user with minimal properties", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
    })
  })

  describe("Styling Classes", () => {
    it("should apply min-height screen to main", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const main = container.querySelector("main")
      expect(main).toHaveClass("min-h-screen")
    })

    it("should apply gray-50 background to main", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const main = container.querySelector("main")
      expect(main).toHaveClass("bg-gray-50")
    })

    it("should apply max-w-7xl to container", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const contentDiv = container.querySelector(".max-w-7xl")
      expect(contentDiv).toBeInTheDocument()
    })

    it("should apply py-8 to container", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test", email: "test@test.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const contentDiv = container.querySelector(".py-8")
      expect(contentDiv).toBeInTheDocument()
    })
  })

  describe("Error Handling", () => {
    it("should handle empty tasks array", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      expect(container.querySelector('[data-testid="task-board"]')).toBeInTheDocument()
      expect(container.querySelector('[data-testid="task-board"]')?.getAttribute("data-tasks-count")).toBe("0")
    })

    it("should render TaskBoard even when getTasks returns empty array", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "1", name: "Test User", email: "test@example.com" }
      } as any)
      mockGetTasks.mockResolvedValue([])

      const { container } = render(await TasksPage())

      const taskBoard = container.querySelector('[data-testid="task-board"]')
      expect(taskBoard).toBeInTheDocument()
    })
  })
})
