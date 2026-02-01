/**
 * Unit tests for src/app/actions/tasks.ts
 *
 * Tests cover:
 * - createTask with authentication
 * - createTask with Zod validation
 * - updateTask with ownership verification
 * - deleteTask with ownership verification
 * - getTasks with and without userId
 * - reorderTask with status and order updates
 * - Error handling for all functions
 * - Path revalidation
 */

import { revalidatePath } from "next/cache"
import { ZodError } from "zod"

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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

import { createTask, updateTask, deleteTask, getTasks, reorderTask } from "@/app/actions/tasks"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe("Task Actions", () => {
  const mockUser = { id: "user-123", email: "test@example.com", name: "Test User" }
  const mockSession = { user: mockUser } as any

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("createTask", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await createTask({ title: "New Task" })

      expect(result).toEqual({ error: "Unauthorized" })
      expect(mockPrisma.task.create).not.toHaveBeenCalled()
    })

    it("should return unauthorized when session has no user", async () => {
      mockAuth.mockResolvedValue({} as any)

      const result = await createTask({ title: "New Task" })

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should create a task with valid data", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const newTask = {
        id: "task-1",
        title: "New Task",
        description: "Task description",
        priority: "high" as const,
        dueDate: new Date("2024-12-31"),
        userId: "user-123"
      }
      mockPrisma.task.create.mockResolvedValue(newTask)

      const result = await createTask({
        title: "New Task",
        description: "Task description",
        priority: "high",
        dueDate: "2024-12-31"
      })

      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: {
          title: "New Task",
          description: "Task description",
          priority: "high",
          dueDate: new Date("2024-12-31"),
          userId: "user-123"
        }
      })
      expect(result).toEqual({ success: true, task: newTask })
    })

    it("should create task with default medium priority", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const newTask = {
        id: "task-1",
        title: "New Task",
        priority: "medium" as const,
        userId: "user-123"
      }
      mockPrisma.task.create.mockResolvedValue(newTask)

      await createTask({ title: "New Task" })

      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: "medium"
        })
      })
    })

    it("should handle null due date", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const newTask = {
        id: "task-1",
        title: "New Task",
        priority: "medium" as const,
        dueDate: null,
        userId: "user-123"
      }
      mockPrisma.task.create.mockResolvedValue(newTask)

      await createTask({ title: "New Task", dueDate: undefined })

      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dueDate: null
        })
      })
    })

    it("should validate title is required", async () => {
      mockAuth.mockResolvedValue(mockSession)

      const result = await createTask({ title: "" })

      expect(result).toEqual({
        error: "Invalid input",
        details: expect.any(Array)
      })
    })

    it("should validate priority enum", async () => {
      mockAuth.mockResolvedValue(mockSession)

      const result = await createTask({
        title: "Test",
        priority: "invalid"
      } as any)

      expect(result).toEqual({
        error: "Invalid input",
        details: expect.any(Array)
      })
    })

    it("should revalidate paths after creating task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.create.mockResolvedValue({
        id: "task-1",
        title: "New Task",
        priority: "medium",
        userId: "user-123"
      })

      await createTask({ title: "New Task" })

      expect(mockRevalidatePath).toHaveBeenCalledWith("/tasks")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error on create failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.create.mockRejectedValue(new Error("Database error"))

      const result = await createTask({ title: "New Task" })

      expect(result).toEqual({ error: "Failed to create task" })
    })

    it("should handle optional description", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.create.mockResolvedValue({
        id: "task-1",
        title: "Task without description",
        priority: "medium",
        userId: "user-123"
      })

      await createTask({ title: "Task without description" })

      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: "Task without description",
          description: undefined
        })
      })
    })
  })

  describe("updateTask", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await updateTask("task-1", { title: "Updated" })

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return error when task not found", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await updateTask("task-1", { title: "Updated" })

      expect(result).toEqual({ error: "Task not found" })
    })

    it("should update task title", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        title: "Old Title"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const updatedTask = { ...existingTask, title: "New Title" }
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      const result = await updateTask("task-1", { title: "New Title" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { title: "New Title" }
      })
      expect(result).toEqual({ success: true, task: updatedTask })
    })

    it("should update task description", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        title: "Task"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const updatedTask = { ...existingTask, description: "New description" }
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      await updateTask("task-1", { description: "New description" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { description: "New description" }
      })
    })

    it("should update task status", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        status: "todo"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const updatedTask = { ...existingTask, status: "in-progress" }
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      await updateTask("task-1", { status: "in-progress" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { status: "in-progress" }
      })
    })

    it("should update task priority", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        priority: "low"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const updatedTask = { ...existingTask, priority: "high" }
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      await updateTask("task-1", { priority: "high" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { priority: "high" }
      })
    })

    it("should update task due date", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const newDueDate = new Date("2024-12-31")
      mockPrisma.task.update.mockResolvedValue({ ...existingTask, dueDate: newDueDate })

      await updateTask("task-1", { dueDate: "2024-12-31" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { dueDate: newDueDate }
      })
    })

    it("should set due date to null when empty string", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        dueDate: new Date()
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      mockPrisma.task.update.mockResolvedValue({ ...existingTask, dueDate: null })

      await updateTask("task-1", { dueDate: "" })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { dueDate: null }
      })
    })

    it("should verify task ownership before update", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await updateTask("task-1", { title: "Updated" })

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: "task-1", userId: "user-123" }
      })
      expect(result).toEqual({ error: "Task not found" })
    })

    it("should revalidate paths after updating task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.update.mockResolvedValue({
        id: "task-1",
        title: "Updated"
      })

      await updateTask("task-1", { title: "Updated" })

      expect(mockRevalidatePath).toHaveBeenCalledWith("/tasks")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error on update failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.update.mockRejectedValue(new Error("Database error"))

      const result = await updateTask("task-1", { title: "Updated" })

      expect(result).toEqual({ error: "Failed to update task" })
    })

    it("should not include undefined values in update data", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        title: "Original"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      mockPrisma.task.update.mockResolvedValue(existingTask)

      await updateTask("task-1", {})

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {}
      })
    })
  })

  describe("deleteTask", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await deleteTask("task-1")

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return error when task not found", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await deleteTask("task-1")

      expect(result).toEqual({ error: "Task not found" })
    })

    it("should delete task when ownership verified", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        title: "Task to delete"
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      mockPrisma.task.delete.mockResolvedValue(existingTask)

      const result = await deleteTask("task-1")

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: "task-1", userId: "user-123" }
      })
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({
        where: { id: "task-1" }
      })
      expect(result).toEqual({ success: true })
    })

    it("should revalidate paths after deleting task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.delete.mockResolvedValue({})

      await deleteTask("task-1")

      expect(mockRevalidatePath).toHaveBeenCalledWith("/tasks")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error on delete failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.delete.mockRejectedValue(new Error("Database error"))

      const result = await deleteTask("task-1")

      expect(result).toEqual({ error: "Failed to delete task" })
    })

    it("should verify task ownership before delete", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await deleteTask("task-1")

      expect(mockPrisma.task.delete).not.toHaveBeenCalled()
      expect(result).toEqual({ error: "Task not found" })
    })
  })

  describe("getTasks", () => {
    it("should return empty array when no userId provided and no session", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await getTasks()

      expect(result).toEqual([])
    })

    it("should return empty array when session has no user", async () => {
      mockAuth.mockResolvedValue({} as any)

      const result = await getTasks()

      expect(result).toEqual([])
    })

    it("should get tasks for authenticated user", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const tasks = [
        { id: "task-1", userId: "user-123", title: "Task 1" },
        { id: "task-2", userId: "user-123", title: "Task 2" }
      ]
      mockPrisma.task.findMany.mockResolvedValue(tasks)

      const result = await getTasks()

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }]
      })
      expect(result).toEqual(tasks)
    })

    it("should use provided userId directly", async () => {
      const tasks = [
        { id: "task-1", userId: "custom-user", title: "Task 1" }
      ]
      mockPrisma.task.findMany.mockResolvedValue(tasks)

      const result = await getTasks("custom-user")

      expect(mockAuth).not.toHaveBeenCalled()
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId: "custom-user" },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }]
      })
      expect(result).toEqual(tasks)
    })

    it("should return empty array on error", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findMany.mockRejectedValue(new Error("Database error"))

      const result = await getTasks()

      expect(result).toEqual([])
    })

    it("should order tasks by order asc then createdAt desc", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findMany.mockResolvedValue([])

      await getTasks()

      const findManyCall = mockPrisma.task.findMany.mock.calls[0]
      expect(findManyCall[0].orderBy).toEqual([
        { order: "asc" },
        { createdAt: "desc" }
      ])
    })
  })

  describe("reorderTask", () => {
    it("should return unauthorized when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const result = await reorderTask({
        id: "task-1",
        newStatus: "in-progress",
        newOrder: 1
      })

      expect(result).toEqual({ error: "Unauthorized" })
    })

    it("should return error when task not found", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await reorderTask({
        id: "task-1",
        newStatus: "in-progress",
        newOrder: 1
      })

      expect(result).toEqual({ error: "Task not found" })
    })

    it("should update task status and order", async () => {
      mockAuth.mockResolvedValue(mockSession)
      const existingTask = {
        id: "task-1",
        userId: "user-123",
        status: "todo",
        order: 0
      }
      mockPrisma.task.findFirst.mockResolvedValue(existingTask)
      const updatedTask = {
        ...existingTask,
        status: "in-progress",
        order: 1
      }
      mockPrisma.task.update.mockResolvedValue(updatedTask)

      const result = await reorderTask({
        id: "task-1",
        newStatus: "in-progress",
        newOrder: 1
      })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          status: "in-progress",
          order: 1
        }
      })
      expect(result).toEqual({ success: true, task: updatedTask })
    })

    it("should verify task ownership before reorder", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue(null)

      const result = await reorderTask({
        id: "task-1",
        newStatus: "in-progress",
        newOrder: 1
      })

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: "task-1", userId: "user-123" }
      })
      expect(result).toEqual({ error: "Task not found" })
    })

    it("should revalidate paths after reordering task", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.update.mockResolvedValue({
        id: "task-1",
        status: "done",
        order: 2
      })

      await reorderTask({
        id: "task-1",
        newStatus: "done",
        newOrder: 2
      })

      expect(mockRevalidatePath).toHaveBeenCalledWith("/tasks")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard")
    })

    it("should return error on reorder failure", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.update.mockRejectedValue(new Error("Database error"))

      const result = await reorderTask({
        id: "task-1",
        newStatus: "in-progress",
        newOrder: 1
      })

      expect(result).toEqual({ error: "Failed to reorder task" })
    })

    it("should handle different status values", async () => {
      mockAuth.mockResolvedValue(mockSession)
      mockPrisma.task.findFirst.mockResolvedValue({
        id: "task-1",
        userId: "user-123"
      })
      mockPrisma.task.update.mockResolvedValue({
        id: "task-1",
        status: "done"
      })

      await reorderTask({
        id: "task-1",
        newStatus: "done",
        newOrder: 0
      })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          status: "done",
          order: 0
        }
      })
    })
  })
})
