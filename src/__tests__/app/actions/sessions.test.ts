/**
 * Unit tests for src/app/actions/sessions.ts
 *
 * Tests cover:
 * - startSession with authentication
 * - startSession with valid task association
 * - startSession with null task
 * - completeSession with ownership verification
 * - cancelSession with ownership verification
 * - getUserSessions with date filtering
 * - Error handling for all functions
 * - Path revalidation
 */

import { revalidatePath } from "next/cache"

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    focusSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}))

import { startSession, completeSession, cancelSession, getUserSessions } from "@/app/actions/sessions"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe("Session Actions", () => {
  const mockUser = { id: "user-123", email: "test@example.com", name: "Test User" }
  const mockSession = { user: mockUser } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("startSession", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await startSession("task-1", "pomodoro", 25)

      expect(result).toEqual({ error: "Unauthorized" })
      expect(mockPrisma.focusSession.create).not.toHaveBeenCalled()
    })

    it("should return unauthorized when session has no user", async () => {
      mockAuth.mockResolvedValue({} as any)

      const result = await startSession("task-1", "pomodoro", 25)

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return unauthorized when user has no id", async () => {
      mockAuth.mockResolvedValue({ user: {} } as any)

      const result = await startSession("task-1", "pomodoro", 25)

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should create a focus session with task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const newSession = {
        id: "session-1",
        type: "pomodoro",
        duration: 25,
        status: "running",
        startTime: new Date(),
        userId: "user-123",
        taskId: "task-1"
      }
      mockPrisma.focusSession.create.mockResolvedValue(newSession)

      const result = await startSession("task-1", "pomodoro", 25)

      expect(mockPrisma.focusSession.create).toHaveBeenCalledWith({
        data: {
          type: "pomodoro",
          duration: 25,
          status: "running",
          startTime: expect.any(Date),
          userId: "user-123",
          taskId: "task-1"
        }
      })
      expect(result).toEqual({ success: true, session: newSession })
    })

    it("should create a focus session without task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const newSession = {
        id: "session-1",
        type: "pomodoro",
        duration: 25,
        status: "running",
        startTime: new Date(),
        userId: "user-123",
        taskId: null
      }
      mockPrisma.focusSession.create.mockResolvedValue(newSession)

      const result = await startSession(null, "pomodoro", 25)

      expect(mockPrisma.focusSession.create).toHaveBeenCalledWith({
        data: {
          type: "pomodoro",
          duration: 25,
          status: "running",
          startTime: expect.any(Date),
          userId: "user-123",
          taskId: null
        }
      })
      expect(result).toEqual({ success: true, session: newSession })
    })

    it("should revalidate dashboard path after creating session", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.create.mockResolvedValue({
        id: "session-1",
        type: "pomodoro",
        duration: 25,
        status: "running",
        startTime: new Date(),
        userId: "user-123",
        taskId: null
      })

      await startSession(null, "pomodoro", 25)

      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error when create fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.create.mockRejectedValue(new Error("Database error"))

      const result = await startSession(null, "pomodoro", 25)

      expect(result).toEqual({ error: "Failed to start session" })
    })

    it("should handle different session types", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.create.mockResolvedValue({
        id: "session-1",
        type: "custom",
        duration: 60,
        status: "running",
        startTime: new Date(),
        userId: "user-123",
        taskId: null
      })

      await startSession(null, "custom", 60)

      expect(mockPrisma.focusSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "custom",
          duration: 60
        })
      })
    })
  })

  describe("completeSession", () => {
    const endTime = new Date("2024-01-01T12:00:00Z")

    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await completeSession("session-1", endTime)

      expect(result).toEqual({ error: "Unauthorized" })
      expect(mockPrisma.focusSession.findFirst).not.toHaveBeenCalled()
    })

    it("should return unauthorized when session has no user", async () => {
      mockAuth.mockResolvedValue({} as any)

      const result = await completeSession("session-1", endTime)

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return error when session not found", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue(null)

      const result = await completeSession("session-1", endTime)

      expect(result).toEqual({ error: "Session not found" })
    })

    it("should return error when session belongs to different user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue(null)

      const result = await completeSession("session-1", endTime)

      expect(result).toEqual({ error: "Session not found" })
    })

    it("should complete session when ownership verified", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingSession = {
        id: "session-1",
        userId: "user-123",
        status: "running"
      }
      mockPrisma.focusSession.findFirst.mockResolvedValue(existingSession)
      const updatedSession = {
        ...existingSession,
        status: "completed",
        endTime
      }
      mockPrisma.focusSession.update.mockResolvedValue(updatedSession)

      const result = await completeSession("session-1", endTime)

      expect(mockPrisma.focusSession.findFirst).toHaveBeenCalledWith({
        where: { id: "session-1", userId: "user-123" }
      })
      expect(mockPrisma.focusSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          status: "completed",
          endTime
        }
      })
      expect(result).toEqual({ success: true, session: updatedSession })
    })

    it("should revalidate dashboard path after completing session", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue({
        id: "session-1",
        userId: "user-123",
        status: "running"
      })
      mockPrisma.focusSession.update.mockResolvedValue({
        id: "session-1",
        status: "completed",
        endTime
      })

      await completeSession("session-1", endTime)

      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error when update fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue({
        id: "session-1",
        userId: "user-123",
        status: "running"
      })
      mockPrisma.focusSession.update.mockRejectedValue(new Error("Database error"))

      const result = await completeSession("session-1", endTime)

      expect(result).toEqual({ error: "Failed to complete session" })
    })
  })

  describe("cancelSession", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await cancelSession("session-1")

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return error when session not found", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue(null)

      const result = await cancelSession("session-1")

      expect(result).toEqual({ error: "Session not found" })
    })

    it("should cancel session when ownership verified", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingSession = {
        id: "session-1",
        userId: "user-123",
        status: "running"
      }
      mockPrisma.focusSession.findFirst.mockResolvedValue(existingSession)
      mockPrisma.focusSession.update.mockResolvedValue({
        ...existingSession,
        status: "cancelled",
        endTime: expect.any(Date)
      })

      const result = await cancelSession("session-1")

      expect(mockPrisma.focusSession.findFirst).toHaveBeenCalledWith({
        where: { id: "session-1", userId: "user-123" }
      })
      expect(mockPrisma.focusSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          status: "cancelled",
          endTime: expect.any(Date)
        }
      })
      expect(result).toEqual({ success: true })
    })

    it("should set end time when cancelling session", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue({
        id: "session-1",
        userId: "user-123",
        status: "running"
      })
      const before = new Date()
      mockPrisma.focusSession.update.mockImplementation(async (args: any) => {
        return {
          ...mockPrisma.focusSession.findFirst(args as any),
          endTime: new Date()
        }
      })

      await cancelSession("session-1")

      const updateCall = mockPrisma.focusSession.update.mock.calls[0]
      expect(updateCall[0].data.endTime).toBeInstanceOf(Date)
    })

    it("should revalidate dashboard path after cancelling session", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue({
        id: "session-1",
        userId: "user-123",
        status: "running"
      })
      mockPrisma.focusSession.update.mockResolvedValue({})

      await cancelSession("session-1")

      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error when cancel fails", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findFirst.mockResolvedValue({
        id: "session-1",
        userId: "user-123",
        status: "running"
      })
      mockPrisma.focusSession.update.mockRejectedValue(new Error("Database error"))

      const result = await cancelSession("session-1")

      expect(result).toEqual({ error: "Failed to cancel session" })
    })
  })

  describe("getUserSessions", () => {
    it("should return empty array when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await getUserSessions()

      expect(result).toEqual([])
    })

    it("should return empty array when session has no user", async () => {
      mockAuth.mockResolvedValue({} as any)

      const result = await getUserSessions()

      expect(result).toEqual([])
    })

    it("should return sessions for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const sessions = [
        {
          id: "session-1",
          userId: "user-123",
          type: "pomodoro",
          duration: 25,
          status: "completed",
          startTime: new Date("2024-01-01T10:00:00Z"),
          task: { title: "Task 1" }
        },
        {
          id: "session-2",
          userId: "user-123",
          type: "break",
          duration: 5,
          status: "completed",
          startTime: new Date("2024-01-01T11:00:00Z"),
          task: null
        }
      ]
      mockPrisma.focusSession.findMany.mockResolvedValue(sessions)

      const result = await getUserSessions()

      expect(result).toEqual(sessions)
    })

    it("should filter sessions by default 30 days", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])

      await getUserSessions()

      const findManyCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(findManyCall[0].where.startTime).toBeDefined()
      expect(findManyCall[0].where.startTime.gte).toBeInstanceOf(Date)
    })

    it("should filter sessions by custom days", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])

      await getUserSessions(7)

      const findManyCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(findManyCall[0].where.startTime.gte).toBeInstanceOf(Date)
    })

    it("should include task title in results", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const sessions = [
        {
          id: "session-1",
          userId: "user-123",
          type: "pomodoro",
          task: { title: "My Task" }
        }
      ]
      mockPrisma.focusSession.findMany.mockResolvedValue(sessions)

      const result = await getUserSessions()

      const findManyCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(findManyCall[0].include).toEqual({
        task: { select: { title: true } }
      })
      expect(result[0].task.title).toBe("My Task")
    })

    it("should order sessions by start time descending", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])

      await getUserSessions()

      const findManyCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(findManyCall[0].orderBy).toEqual({ startTime: "desc" })
    })

    it("should only return sessions for the current user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])

      await getUserSessions()

      const findManyCall = mockPrisma.focusSession.findMany.mock.calls[0]
      expect(findManyCall[0].where.userId).toBe("user-123")
    })

    it("should return empty array on error", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockRejectedValue(new Error("Database error"))

      const result = await getUserSessions()

      expect(result).toEqual([])
    })

    it("should handle zero days parameter", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.focusSession.findMany.mockResolvedValue([])

      await getUserSessions(0)

      expect(mockPrisma.focusSession.findMany).toHaveBeenCalled()
    })
  })
})
