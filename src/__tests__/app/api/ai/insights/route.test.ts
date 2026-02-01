/**
 * Unit tests for src/app/api/ai/insights/route.ts
 *
 * Tests cover:
 * - Authentication checks
 * - Successful insights generation
 * - Session and task fetching
 * - Error handling
 * - Response status codes
 * - Console error logging
 */

// Mock Next.js server internals
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((data: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: {
        get: (name: string) => name === "content-type" ? "application/json" : null
      }
    }))
  }
}))

// Mock dependencies
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    focusSession: {
      findMany: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/openai", () => ({
  generateInsights: jest.fn(),
}))

import { GET } from "@/app/api/ai/insights/route"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateInsights } from "@/lib/openai"
import { NextResponse } from "next/server"

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGenerateInsights = generateInsights as jest.MockedFunction<typeof generateInsights>

describe("AI Insights API Route", () => {
  const mockUser = { id: "user-123", email: "test@example.com", name: "Test User" }
  const mockSession = { user: mockUser } as any

  const mockSessions = [
    {
      id: "session-1",
      userId: "user-123",
      type: "pomodoro",
      duration: 25,
      status: "completed",
      startTime: new Date("2024-01-01T10:00:00Z"),
      endTime: new Date("2024-01-01T10:25:00Z"),
    },
    {
      id: "session-2",
      userId: "user-123",
      type: "break",
      duration: 5,
      status: "completed",
      startTime: new Date("2024-01-01T11:00:00Z"),
      endTime: new Date("2024-01-01T11:05:00Z"),
    },
  ]

  const mockTasks = [
    {
      id: "task-1",
      userId: "user-123",
      title: "Complete project",
      status: "todo",
      priority: "high",
      dueDate: null,
      createdAt: new Date("2024-01-01T09:00:00Z"),
    },
    {
      id: "task-2",
      userId: "user-123",
      title: "Review code",
      status: "in-progress",
      priority: "medium",
      dueDate: new Date("2024-01-05"),
      createdAt: new Date("2024-01-01T08:00:00Z"),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("Authentication", () => {
    it("should return 401 when session is null", async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should return 401 when session exists but user is null", async () => {
      mockAuth.mockResolvedValue({ user: null } as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should return 401 when user has no id", async () => {
      mockAuth.mockResolvedValue({ user: { email: "test@test.com" } } as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should not fetch data when unauthorized", async () => {
      mockAuth.mockResolvedValue(null)

      await GET()

      expect(mockPrisma.focusSession.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.task.findMany).not.toHaveBeenCalled()
      expect(mockGenerateInsights).not.toHaveBeenCalled()
    })
  })

  describe("Data Fetching", () => {
    it("should call auth to check session", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      expect(mockAuth).toHaveBeenCalled()
    })

    it("should fetch sessions for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      expect(mockPrisma.focusSession.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { startTime: "desc" },
        take: 50
      })
    })

    it("should fetch tasks for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { createdAt: "desc" }
      })
    })

    it("should limit sessions to 50 most recent", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(sessionsCall[0].take).toBe(50)
    })

    it("should order sessions by start time descending", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(sessionsCall[0].orderBy).toEqual({ startTime: "desc" })
    })

    it("should order tasks by created at descending", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      const tasksCall = mockPrisma.task.findMany.mock.calls[0]
      expect(tasksCall[0].orderBy).toEqual({ createdAt: "desc" })
    })

    it("should fetch tasks for the authenticated user only", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      await GET()

      const tasksCall = mockPrisma.task.findMany.mock.calls[0]
      expect(tasksCall[0].where.userId).toBe("user-123")
    })
  })

  describe("Insights Generation", () => {
    it("should call generateInsights with fetched data", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      mockGenerateInsights.mockResolvedValue({
        insights: ["Keep up the good work!", "Focus on high priority tasks"],
        error: null
      })

      await GET()

      expect(mockGenerateInsights).toHaveBeenCalledWith(mockSessions, mockTasks)
    })

    it("should return insights in response", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      const insightsResult = {
        insights: ["Great progress!", "Consider taking breaks"],
        error: null
      }
      mockGenerateInsights.mockResolvedValue(insightsResult)

      const response = await GET()
      const data = await response.json()

      expect(data).toEqual(insightsResult)
    })

    it("should return 200 status on success", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test insight"],
        error: null
      })

      const response = await GET()

      expect(response.status).toBe(200)
    })

    it("should handle empty sessions and tasks", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Create your first task to get started!"],
        error: null
      })

      const response = await GET()
      const data = await response.json()

      expect(data.insights).toEqual(["Create your first task to get started!"])
    })

    it("should handle API error in generateInsights", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Default insight"],
        error: "Groq API key not configured"
      })

      const response = await GET()
      const data = await response.json()

      expect(data.error).toBe("Groq API key not configured")
      expect(data.insights).toBeDefined()
    })
  })

  describe("Error Handling", () => {
    it("should return 500 when sessions fetch fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockRejectedValue(new Error("Database error"))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: "Failed to generate insights" })
    })

    it("should return 500 when tasks fetch fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockRejectedValue(new Error("Database error"))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: "Failed to generate insights" })
    })

    it("should return 500 when generateInsights fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockRejectedValue(new Error("AI service error"))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: "Failed to generate insights" })
    })

    it("should log error to console on failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const error = new Error("Test error")
      mockGenerateInsights.mockRejectedValue(error)

      await GET()

      expect(console.error).toHaveBeenCalledWith("AI insights error:", error)
    })
  })

  describe("Response Format", () => {
    it("should return JSON response", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Test"],
        error: null
      })

      const response = await GET()

      expect(response.headers.get("content-type")).toContain("application/json")
    })

    it("should include insights array in response", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Insight 1", "Insight 2", "Insight 3"],
        error: null
      })

      const response = await GET()
      const data = await response.json()

      expect(Array.isArray(data.insights)).toBe(true)
      expect(data.insights).toHaveLength(3)
    })

    it("should include error field when present", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: [],
        error: "API key not configured"
      })

      const response = await GET()
      const data = await response.json()

      expect(data.error).toBe("API key not configured")
    })
  })

  describe("Edge Cases", () => {
    it("should handle null insights from generateInsights", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: [],
        error: null
      } as any)

      const response = await GET()
      const data = await response.json()

      expect(data.insights).toEqual([])
    })

    it("should handle sessions with various statuses", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const mixedSessions = [
        { ...mockSessions[0], status: "completed" },
        { ...mockSessions[1], status: "running" },
        { id: "session-3", status: "cancelled", userId: "user-123" }
      ]
      mockPrisma.focusSession.findMany.mockResolvedValue(mixedSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Mixed session insights"],
        error: null
      })

      const response = await GET()

      expect(response.status).toBe(200)
      expect(mockGenerateInsights).toHaveBeenCalledWith(mixedSessions, [])
    })

    it("should handle tasks with various statuses", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      const mixedTasks = [
        { ...mockTasks[0], status: "todo" },
        { ...mockTasks[1], status: "in-progress" },
        { id: "task-3", status: "done", userId: "user-123" }
      ]
      mockPrisma.task.findMany.mockResolvedValue(mixedTasks)
      mockGenerateInsights.mockResolvedValue({
        insights: ["Mixed task insights"],
        error: null
      })

      const response = await GET()

      expect(response.status).toBe(200)
      expect(mockGenerateInsights).toHaveBeenCalledWith([], mixedTasks)
    })

    it("should handle large number of sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const manySessions = Array.from({ length: 50 }, (_, i) => ({
        id: `session-${i}`,
        userId: "user-123",
        type: "pomodoro",
        duration: 25,
        status: "completed",
        startTime: new Date(`2024-01-01T${String(i).padStart(2, "0")}:00:00Z`),
        endTime: new Date(`2024-01-01T${String(i).padStart(2, "0")}:25:00Z`),
      }))
      mockPrisma.focusSession.findMany.mockResolvedValue(manySessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      mockGenerateInsights.mockResolvedValue({
        insights: ["Great productivity!"],
        error: null
      })

      const response = await GET()

      expect(response.status).toBe(200)
    })

    it("should handle large number of tasks", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      const manyTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        userId: "user-123",
        title: `Task ${i}`,
        status: i % 3 === 0 ? "done" : "todo",
        priority: i % 2 === 0 ? "high" : "medium",
        dueDate: null,
        createdAt: new Date(`2024-01-01T${String(i).padStart(2, "0")}:00:00Z`),
      }))
      mockPrisma.task.findMany.mockResolvedValue(manyTasks)
      mockGenerateInsights.mockResolvedValue({
        insights: ["You have many tasks to work on"],
        error: null
      })

      const response = await GET()

      expect(response.status).toBe(200)
    })
  })
})
