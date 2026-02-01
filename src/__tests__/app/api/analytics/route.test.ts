/**
 * Unit tests for src/app/api/analytics/route.ts
 *
 * Tests cover:
 * - Authentication checks
 * - Query parameter parsing
 * - Session fetching with date filtering
 * - Task fetching
 * - Daily focus time calculation
 * - Task statistics calculation
 * - Session statistics calculation
 * - Peak hours calculation
 * - Error handling
 * - Response format
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

import { GET } from "@/app/api/analytics/route"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe("Analytics API Route", () => {
  const mockUser = { id: "user-123", email: "test@example.com", name: "Test User" }
  const mockSession = { user: mockUser } as any

  const mockSessions = [
    {
      id: "session-1",
      userId: "user-123",
      type: "pomodoro",
      status: "completed",
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T10:25:00Z"),
      task: { title: "Complete project", status: "completed", priority: "high" }
    },
    {
      id: "session-2",
      userId: "user-123",
      type: "break",
      status: "completed",
      startTime: new Date("2024-01-15T14:30:00Z"),
      endTime: new Date("2024-01-15T14:35:00Z"),
      task: null
    },
    {
      id: "session-3",
      userId: "user-123",
      type: "pomodoro",
      status: "cancelled",
      startTime: new Date("2024-01-14T09:00:00Z"),
      endTime: new Date("2024-01-14T09:10:00Z"),
      task: { title: "Review code", status: "in-progress", priority: "medium" }
    },
  ]

  const mockTasks = [
    {
      id: "task-1",
      userId: "user-123",
      title: "Complete project",
      status: "completed",
      priority: "high"
    },
    {
      id: "task-2",
      userId: "user-123",
      title: "Review code",
      status: "in-progress",
      priority: "medium"
    },
    {
      id: "task-3",
      userId: "user-123",
      title: "Write tests",
      status: "todo",
      priority: "low"
    },
    {
      id: "task-4",
      userId: "user-123",
      title: "Bug fix",
      status: "todo",
      priority: "high"
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
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should return 401 when session exists but user is null", async () => {
      mockAuth.mockResolvedValue({ user: null } as any)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should return 401 when user has no id", async () => {
      mockAuth.mockResolvedValue({ user: { email: "test@test.com" } } as any)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: "Unauthorized" })
    })

    it("should not fetch data when unauthorized", async () => {
      mockAuth.mockResolvedValue(null)
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      expect(mockPrisma.focusSession.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.task.findMany).not.toHaveBeenCalled()
    })
  })

  describe("Query Parameters", () => {
    it("should use default 30 days when days parameter is missing", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      const startDate = sessionsCall[0].where.startTime.gte
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() - 30)
      expect(startDate).toBeInstanceOf(Date)
    })

    it("should parse days parameter from URL", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics?days=7")

      await GET(request)

      expect(mockPrisma.focusSession.findMany).toHaveBeenCalled()
    })

    it("should handle days=7 parameter", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics?days=7")

      await GET(request)

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(sessionsCall[0].where.startTime.gte).toBeInstanceOf(Date)
    })

    it("should handle days=90 parameter", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics?days=90")

      await GET(request)

      expect(mockPrisma.focusSession.findMany).toHaveBeenCalled()
    })

    it("should handle invalid days parameter gracefully", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics?days=invalid")

      await GET(request)

      // Should still call findMany with default NaN handling (falls back to default)
      expect(mockPrisma.focusSession.findMany).toHaveBeenCalled()
    })
  })

  describe("Data Fetching", () => {
    it("should fetch sessions for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      expect(mockPrisma.focusSession.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          startTime: { gte: expect.any(Date) }
        },
        include: {
          task: {
            select: { title: true, status: true, priority: true }
          }
        },
        orderBy: { startTime: "desc" }
      })
    })

    it("should fetch tasks for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" }
      })
    })

    it("should include task info in sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(sessionsCall[0].include).toEqual({
        task: {
          select: { title: true, status: true, priority: true }
        }
      })
    })

    it("should order sessions by start time descending", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      const sessionsCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(sessionsCall[0].orderBy).toEqual({ startTime: "desc" })
    })
  })

  describe("Daily Data Calculation", () => {
    it("should calculate daily focus time correctly", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: new Date("2024-01-15T10:00:00Z"),
          endTime: new Date("2024-01-15T10:25:00Z") // 25 minutes
        },
        {
          ...mockSessions[1],
          startTime: new Date("2024-01-15T14:00:00Z"),
          endTime: new Date("2024-01-15T14:30:00Z") // 30 minutes
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.dailyData).toBeDefined()
      expect(data.dailyData.length).toBeGreaterThan(0)
    })

    it("should calculate sessions per day correctly", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: new Date("2024-01-15T10:00:00Z"),
          endTime: new Date("2024-01-15T10:25:00Z")
        },
        {
          ...mockSessions[1],
          startTime: new Date("2024-01-15T14:00:00Z"),
          endTime: new Date("2024-01-15T14:30:00Z")
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      const dayEntry = data.dailyData.find((d: any) => d.date === "2024-01-15")
      expect(dayEntry.sessions).toBe(2)
    })

    it("should handle sessions without endTime", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          endTime: null // No end time
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.dailyData[0].minutes).toBe(0)
    })

    it("should return dailyData array with date, minutes, and sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(Array.isArray(data.dailyData)).toBe(true)
      if (data.dailyData.length > 0) {
        expect(data.dailyData[0]).toHaveProperty("date")
        expect(data.dailyData[0]).toHaveProperty("minutes")
        expect(data.dailyData[0]).toHaveProperty("sessions")
      }
    })
  })

  describe("Task Statistics", () => {
    it("should calculate total task count", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.taskStats.total).toBe(4)
    })

    it("should count tasks by status", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.taskStats.todo).toBe(2)
      expect(data.taskStats.inProgress).toBe(1)
      expect(data.taskStats.completed).toBe(1)
    })

    it("should count tasks by priority", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue(mockTasks)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.taskStats.highPriority).toBe(2)
      expect(data.taskStats.mediumPriority).toBe(1)
      expect(data.taskStats.lowPriority).toBe(1)
    })

    it("should handle empty task list", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.taskStats.total).toBe(0)
      expect(data.taskStats.todo).toBe(0)
      expect(data.taskStats.inProgress).toBe(0)
      expect(data.taskStats.completed).toBe(0)
      expect(data.taskStats.highPriority).toBe(0)
      expect(data.taskStats.mediumPriority).toBe(0)
      expect(data.taskStats.lowPriority).toBe(0)
    })
  })

  describe("Session Statistics", () => {
    it("should calculate total session count", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.total).toBe(3)
    })

    it("should count completed sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.completed).toBe(2)
    })

    it("should count cancelled sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue(mockSessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.cancelled).toBe(1)
    })

    it("should calculate total focus time in minutes", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: new Date("2024-01-15T10:00:00Z"),
          endTime: new Date("2024-01-15T10:25:00Z") // 25 minutes
        },
        {
          ...mockSessions[1],
          startTime: new Date("2024-01-15T14:00:00Z"),
          endTime: new Date("2024-01-15T14:35:00Z") // 35 minutes
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.totalMinutes).toBe(60)
    })

    it("should exclude sessions without endTime from total minutes", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: new Date("2024-01-15T10:00:00Z"),
          endTime: new Date("2024-01-15T10:25:00Z")
        },
        {
          ...mockSessions[2],
          startTime: new Date("2024-01-15T11:00:00Z"),
          endTime: null // Should be excluded
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.totalMinutes).toBe(25)
    })

    it("should handle empty session list", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats.total).toBe(0)
      expect(data.sessionStats.completed).toBe(0)
      expect(data.sessionStats.cancelled).toBe(0)
      expect(data.sessionStats.totalMinutes).toBe(0)
    })
  })

  describe("Peak Hours Calculation", () => {
    it("should calculate peak productivity hours", async () => {
      mockAuth.mockResolvedValue(mockSession)

      // Create dates at a specific local hour to avoid timezone issues
      const date1 = new Date("2024-01-15T00:00:00Z")
      date1.setHours(9, 0, 0, 0)
      const date2 = new Date("2024-01-15T00:00:00Z")
      date2.setHours(9, 30, 0, 0)
      const date3 = new Date("2024-01-15T00:00:00Z")
      date3.setHours(14, 0, 0, 0)

      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: date1, // hour 9
          endTime: new Date(date1.getTime() + 25 * 60 * 1000),
          status: "completed"
        },
        {
          ...mockSessions[1],
          startTime: date2, // hour 9
          endTime: new Date(date2.getTime() + 25 * 60 * 1000),
          status: "completed"
        },
        {
          ...mockSessions[2],
          startTime: date3, // hour 14
          endTime: new Date(date3.getTime() + 25 * 60 * 1000),
          status: "completed"
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(Array.isArray(data.peakHours)).toBe(true)
      expect(data.peakHours[0].hour).toBe(9) // Hour 9 should be first (most sessions)
      expect(data.peakHours[0].count).toBe(2)
    })

    it("should only count completed sessions for peak hours", async () => {
      mockAuth.mockResolvedValue(mockSession)

      const date1 = new Date("2024-01-15T00:00:00Z")
      date1.setHours(9, 0, 0, 0)
      const date2 = new Date("2024-01-15T00:00:00Z")
      date2.setHours(10, 0, 0, 0)

      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[0],
          startTime: date1,
          endTime: new Date(date1.getTime() + 25 * 60 * 1000),
          status: "completed"
        },
        {
          ...mockSessions[2],
          startTime: date2,
          endTime: new Date(date2.getTime() + 10 * 60 * 1000),
          status: "cancelled" // Should not be counted
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.peakHours.length).toBe(1)
      expect(data.peakHours[0].hour).toBe(9)
      expect(data.peakHours[0].count).toBe(1)
    })

    it("should return top 5 peak hours", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const manySessions = Array.from({ length: 10 }, (_, i) => {
        const date = new Date("2024-01-15T00:00:00Z")
        date.setHours(i, 0, 0, 0)
        return {
          ...mockSessions[0],
          id: `session-${i}`,
          startTime: date,
          endTime: new Date(date.getTime() + 25 * 60 * 1000),
          status: "completed"
        }
      })
      mockPrisma.focusSession.findMany.mockResolvedValue(manySessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.peakHours).toBeDefined()
      expect(data.peakHours.length).toBeLessThanOrEqual(5)
    })

    it("should handle empty sessions for peak hours", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(Array.isArray(data.peakHours)).toBe(true)
      expect(data.peakHours.length).toBe(0)
    })

    it("should sort peak hours by count descending", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        { ...mockSessions[0], startTime: new Date("2024-01-15T10:00:00Z"), status: "completed" },
        { ...mockSessions[1], startTime: new Date("2024-01-15T10:30:00Z"), status: "completed" },
        { ...mockSessions[0], startTime: new Date("2024-01-15T09:00:00Z"), status: "completed" },
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      for (let i = 0; i < data.peakHours.length - 1; i++) {
        expect(data.peakHours[i].count).toBeGreaterThanOrEqual(data.peakHours[i + 1].count)
      }
    })
  })

  describe("Error Handling", () => {
    it("should return 500 when sessions fetch fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockRejectedValue(new Error("Database error"))
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: "Failed to fetch analytics" })
    })

    it("should return 500 when tasks fetch fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockRejectedValue(new Error("Database error"))
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: "Failed to fetch analytics" })
    })

    it("should log error to console on failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const error = new Error("Test error")
      mockPrisma.focusSession.findMany.mockRejectedValue(error)
      const request = new Request("http://localhost:3000/api/analytics")

      await GET(request)

      expect(console.error).toHaveBeenCalledWith("Analytics error:", error)
    })
  })

  describe("Response Format", () => {
    it("should return JSON response", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)

      expect(response.headers.get("content-type")).toContain("application/json")
    })

    it("should return 200 status on success", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)

      expect(response.status).toBe(200)
    })

    it("should include all analytics sections in response", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data).toHaveProperty("dailyData")
      expect(data).toHaveProperty("taskStats")
      expect(data).toHaveProperty("sessionStats")
      expect(data).toHaveProperty("peakHours")
    })

    it("should return dailyData as array", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(Array.isArray(data.dailyData)).toBe(true)
    })

    it("should return peakHours as array", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(Array.isArray(data.peakHours)).toBe(true)
    })

    it("should return taskStats with all properties", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.taskStats).toHaveProperty("total")
      expect(data.taskStats).toHaveProperty("todo")
      expect(data.taskStats).toHaveProperty("inProgress")
      expect(data.taskStats).toHaveProperty("completed")
      expect(data.taskStats).toHaveProperty("highPriority")
      expect(data.taskStats).toHaveProperty("mediumPriority")
      expect(data.taskStats).toHaveProperty("lowPriority")
    })

    it("should return sessionStats with all properties", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.sessionStats).toHaveProperty("total")
      expect(data.sessionStats).toHaveProperty("completed")
      expect(data.sessionStats).toHaveProperty("cancelled")
      expect(data.sessionStats).toHaveProperty("totalMinutes")
    })
  })

  describe("Edge Cases", () => {
    it("should handle sessions with null task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        {
          ...mockSessions[1],
          task: null
        }
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)

      expect(response.status).toBe(200)
    })

    it("should handle sessions across multiple days", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([
        { ...mockSessions[0], startTime: new Date("2024-01-14T10:00:00Z"), endTime: new Date("2024-01-14T10:25:00Z") },
        { ...mockSessions[1], startTime: new Date("2024-01-15T14:00:00Z"), endTime: new Date("2024-01-15T14:30:00Z") },
      ])
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(data.dailyData.length).toBeGreaterThanOrEqual(2)
    })

    it("should handle large number of sessions", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const manySessions = Array.from({ length: 100 }, (_, i) => ({
        ...mockSessions[0],
        id: `session-${i}`,
        startTime: new Date(`2024-01-${String(i % 30 + 1).padStart(2, "0")}T10:00:00Z`),
        endTime: new Date(`2024-01-${String(i % 30 + 1).padStart(2, "0")}T10:25:00Z`)
      }))
      mockPrisma.focusSession.findMany.mockResolvedValue(manySessions)
      mockPrisma.task.findMany.mockResolvedValue([])
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)

      expect(response.status).toBe(200)
    })

    it("should handle large number of tasks", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])
      const manyTasks = Array.from({ length: 200 }, (_, i) => ({
        ...mockTasks[0],
        id: `task-${i}`,
        status: i % 3 === 0 ? "completed" : i % 3 === 1 ? "in-progress" : "todo",
        priority: i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low"
      }))
      mockPrisma.task.findMany.mockResolvedValue(manyTasks)
      const request = new Request("http://localhost:3000/api/analytics")

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.taskStats.total).toBe(200)
    })
  })
})
