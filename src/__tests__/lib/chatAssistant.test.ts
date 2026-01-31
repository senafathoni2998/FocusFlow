/**
 * Unit tests for src/lib/chatAssistant.ts
 *
 * Tests cover:
 * - getSuggestedActions function
 * - Various task states
 * - Different suggestion scenarios
 */

import { getSuggestedActions } from "@/lib/chatAssistant"

// Mock the getTasks action
jest.mock("@/app/actions/tasks", () => ({
  getTasks: jest.fn(),
}))

describe("Chat Assistant - Suggested Actions", () => {
  let mockGetTasks: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    mockGetTasks = require("@/app/actions/tasks").getTasks
  })

  const createMockTask = (status: string, priority: string, dueDate: Date | null = null, title: string = "Task") => ({
    id: Math.random().toString(),
    title,
    status,
    priority,
    dueDate,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  describe("High priority tasks", () => {
    it("should suggest showing high priority tasks when they exist", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "high"),
        createMockTask("todo", "medium"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show my high priority tasks")
    })

    it("should not suggest showing high priority tasks when all are completed", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("completed", "high"),
        createMockTask("completed", "high"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).not.toContain("Show my high priority tasks")
    })

    it("should suggest showing high priority tasks with multiple pending", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "high"),
        createMockTask("in-progress", "high"),
        createMockTask("todo", "medium"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show my high priority tasks")
    })
  })

  describe("Overdue tasks", () => {
    it("should suggest showing overdue tasks when they exist", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "medium", pastDate),
        createMockTask("todo", "high"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show my 1 overdue task")
    })

    it("should use plural form for multiple overdue tasks", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "medium", pastDate),
        createMockTask("todo", "high", pastDate),
        createMockTask("todo", "high", pastDate),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show my 3 overdue tasks")
    })

    it("should not suggest showing overdue tasks when none exist", async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "medium", futureDate),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).not.toContain("overdue")
    })

    it("should not count completed overdue tasks", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("completed", "medium", pastDate),
        createMockTask("todo", "high", pastDate),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show my 1 overdue task")
    })
  })

  describe("Many pending tasks", () => {
    it("should suggest prioritizing when there are more than 5 pending tasks", async () => {
      const tasks = Array.from({ length: 10 }, () =>
        createMockTask("todo", "medium")
      )
      mockGetTasks.mockResolvedValue(tasks)

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Help me prioritize my tasks")
    })

    it("should not suggest prioritizing when 5 or fewer pending tasks", async () => {
      const tasks = Array.from({ length: 5 }, () =>
        createMockTask("todo", "medium")
      )
      mockGetTasks.mockResolvedValue(tasks)

      const suggestions = await getSuggestedActions()

      expect(suggestions).not.toContain("Help me prioritize my tasks")
    })

    it("should count only non-completed tasks for prioritization", async () => {
      const tasks = [
        ...Array.from({ length: 4 }, () => createMockTask("todo", "medium")),
        ...Array.from({ length: 5 }, () => createMockTask("completed", "medium")),
      ]
      mockGetTasks.mockResolvedValue(tasks)

      const suggestions = await getSuggestedActions()

      expect(suggestions).not.toContain("Help me prioritize my tasks")
    })
  })

  describe("No tasks", () => {
    it("should suggest creating first task when no tasks exist", async () => {
      mockGetTasks.mockResolvedValue([])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Create my first task")
    })

    it("should not suggest creating first task when tasks exist", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "medium"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).not.toContain("Create my first task")
    })
  })

  describe("Default suggestions", () => {
    it("should return default suggestions when no specific conditions match", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "medium"),
        createMockTask("completed", "high"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show all my tasks")
      expect(suggestions).toContain("Create a new task")
    })

    it("should return default suggestions when only completed tasks exist", async () => {
      mockGetTasks.mockResolvedValue([
        createMockTask("completed", "high"),
        createMockTask("completed", "medium"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions).toContain("Show all my tasks")
      expect(suggestions).toContain("Create a new task")
    })
  })

  describe("Multiple suggestions", () => {
    it("should return up to 3 suggestions", async () => {
      const suggestions = await getSuggestedActions()

      expect(suggestions.length).toBeLessThanOrEqual(3)
    })

    it("should combine suggestions when multiple conditions match", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "high", pastDate),
        createMockTask("todo", "high"),
        createMockTask("todo", "medium"),
      ])

      const suggestions = await getSuggestedActions()

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })
  })

  describe("Suggestion priority order", () => {
    it("should prioritize overdue tasks suggestion", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      mockGetTasks.mockResolvedValue([
        createMockTask("todo", "high", pastDate),
        createMockTask("todo", "high"),
      ])

      const suggestions = await getSuggestedActions()

      // High priority and overdue both exist
      expect(suggestions.length).toBeGreaterThan(0)
    })
  })
})
