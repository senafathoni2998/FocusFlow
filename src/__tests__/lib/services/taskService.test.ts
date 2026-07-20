/**
 * taskService: the mobile API's task domain logic. Exercises ownership checks,
 * create defaults, recurrence-vs-terminal completion, and reorder completedAt sync
 * against the global Prisma mock (extended here with the models this service uses).
 */
jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}))

import {
  createTask,
  deleteTask,
  completeTask,
  reorderTask,
  updateTask,
} from "@/lib/services/taskService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) also drains mockResolvedValueOnce queues, so
  // an over-queued value from one test can't leak into the next.
  jest.resetAllMocks()
  prisma.task.aggregate = jest.fn().mockResolvedValue({ _max: { order: 40 } })
  prisma.list = { findFirst: jest.fn() }
  prisma.goal = { findFirst: jest.fn() }
  prisma.recurrenceRule = { create: jest.fn(), update: jest.fn(), delete: jest.fn().mockResolvedValue({}) }
  prisma.$transaction = jest.fn().mockResolvedValue([])
  prisma.focusSession.findMany = jest.fn().mockResolvedValue([])
})

describe("taskService.createTask", () => {
  it("creates a task at spaced order with default priority + flattened tags", async () => {
    prisma.task.create.mockResolvedValue({
      id: "t1",
      title: "Write report",
      priority: "medium",
      tags: [{ tag: { id: "tag1", name: "work" } }],
    })

    const task = await createTask("u1", { title: "Write report", tags: ["work"] })

    const arg = prisma.task.create.mock.calls[0][0].data
    expect(arg.order).toBe(50) // max 40 + 10
    expect(arg.priority).toBe("medium")
    expect(arg.priorityRank).toBe(2)
    expect(arg.userId).toBe("u1")
    expect(task.tags).toEqual([{ id: "tag1", name: "work" }])
    expect(task.actualMin).toBe(0)
  })

  it("rejects a missing title (validation)", async () => {
    await expect(createTask("u1", { title: "" })).rejects.toBeDefined()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it("404s when the parent task is not owned", async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(createTask("u1", { title: "sub", parentTaskId: "foreign" })).rejects.toMatchObject({
      status: 404,
    })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it("404s when the list is not owned", async () => {
    prisma.list.findFirst.mockResolvedValue(null)
    await expect(createTask("u1", { title: "x", listId: "foreign" })).rejects.toMatchObject({
      status: 404,
    })
  })

  it("404s when the goal is not owned", async () => {
    prisma.goal.findFirst.mockResolvedValue(null)
    await expect(createTask("u1", { title: "x", goalId: "foreign" })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("taskService.deleteTask", () => {
  it("404s a task the user doesn't own", async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(deleteTask("u1", "t1")).rejects.toMatchObject({ status: 404 })
    expect(prisma.task.delete).not.toHaveBeenCalled()
  })

  it("deletes an owned task and cleans up its recurrence rule", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1", recurrenceId: "r1" })
    prisma.task.delete.mockResolvedValue({})
    const res = await deleteTask("u1", "t1")
    expect(res).toEqual({ success: true })
    expect(prisma.recurrenceRule.delete).toHaveBeenCalledWith({ where: { id: "r1" } })
  })
})

describe("taskService.completeTask", () => {
  it("completes a non-recurring task (recurred:false, terminal completedAt)", async () => {
    prisma.task.findFirst
      .mockResolvedValueOnce({ id: "t1", recurrence: null, completedAt: null, dueDate: null, startDate: null })
      .mockResolvedValueOnce({ id: "t1", status: "completed", tags: [] })
    prisma.task.update.mockResolvedValue({})

    const res = await completeTask("u1", "t1")
    expect(res.recurred).toBe(false)
    expect(res.task.id).toBe("t1")
    const updateArg = prisma.task.update.mock.calls[0][0].data
    expect(updateArg.status).toBe("completed")
    expect(updateArg.completedAt).toBeInstanceOf(Date)
  })

  it("rolls a recurring task forward instead of completing (recurred:true)", async () => {
    prisma.task.findFirst
      .mockResolvedValueOnce({
        id: "t1",
        dueDate: new Date("2026-01-01T00:00:00"),
        startDate: null,
        completedAt: null,
        recurrence: {
          id: "r1",
          freq: "daily",
          interval: 1,
          anchorMode: "due",
          completedCount: 0,
          count: null,
          until: null,
          anchorDate: new Date("2026-01-01T00:00:00"),
        },
      })
      .mockResolvedValueOnce({ id: "t1", status: "todo", tags: [] })

    const res = await completeTask("u1", "t1")
    expect(res.recurred).toBe(true)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it("404s a task the user doesn't own", async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(completeTask("u1", "t1")).rejects.toMatchObject({ status: 404 })
  })
})

describe("taskService.reorderTask", () => {
  it("syncs completedAt when moving into a terminal column", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1", completedAt: null })
    prisma.task.update.mockResolvedValue({ id: "t1", tags: [] })

    await reorderTask("u1", { id: "t1", newStatus: "completed", newOrder: 5 })
    const updateArg = prisma.task.update.mock.calls[0][0].data
    expect(updateArg.completedAt).toBeInstanceOf(Date)
    expect(updateArg.order).toBe(5)
  })

  it("clears completedAt when moving back to a non-terminal column", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1", completedAt: new Date() })
    prisma.task.update.mockResolvedValue({ id: "t1", tags: [] })

    await reorderTask("u1", { id: "t1", newStatus: "todo", newOrder: 1 })
    expect(prisma.task.update.mock.calls[0][0].data.completedAt).toBeNull()
  })
})

describe("taskService.updateTask", () => {
  it("stamps completedAt on a status→completed edit and preserves an existing one", async () => {
    // updateTask reads the existing task once, then returns the update() result.
    prisma.task.findFirst.mockResolvedValue({
      id: "t1",
      completedAt: null,
      dueDate: null,
      startDate: null,
      recurrenceId: null,
      reminders: [],
      recurrence: null,
    })
    prisma.task.update.mockResolvedValue({ id: "t1", tags: [] })

    await updateTask("u1", "t1", { status: "completed" })
    const updateArg = prisma.task.update.mock.calls[0][0].data
    expect(updateArg.status).toBe("completed")
    expect(updateArg.completedAt).toBeInstanceOf(Date)
  })

  it("404s a task the user doesn't own", async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(updateTask("u1", "t1", { title: "x" })).rejects.toMatchObject({ status: 404 })
  })
})
