/**
 * Unit tests for src/app/actions/goals.ts
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    goal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    task: { findMany: jest.fn() },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

import {
  getGoals,
  createGoal,
  updateGoal,
  adjustGoalProgress,
  setGoalStatus,
  deleteGoal,
} from "@/app/actions/goals"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("Goal Actions", () => {
  const session = { user: { id: "u1" } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockPrisma.goal.aggregate as jest.Mock).mockResolvedValue({ _max: { order: null } })
  })

  describe("getGoals", () => {
    it("returns [] without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getGoals()).toEqual([])
    })

    it("returns the user's non-archived goals with derived task counts", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findMany as jest.Mock).mockResolvedValue([
        {
          id: "g1",
          tasks: [
            { status: "completed", recurrenceId: null },
            { status: "todo", recurrenceId: null },
            { status: "wont-do", recurrenceId: null }, // excluded from the denominator
            { status: "completed", recurrenceId: "r1" }, // excluded: recurring tasks never "finish"
          ],
        },
      ])
      const res = await getGoals()
      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", status: { not: "archived" } } })
      )
      // 2 counted (completed + todo), 1 completed; wont-do + recurring dropped; raw tasks stripped.
      expect(res).toEqual([{ id: "g1", taskTotal: 2, taskCompleted: 1 }])
    })
  })

  describe("getArchivedGoals", () => {
    it("returns the user's archived goals with derived counts", async () => {
      const { getArchivedGoals } = require("@/app/actions/goals")
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findMany as jest.Mock).mockResolvedValue([
        { id: "g1", tasks: [{ status: "completed", recurrenceId: null }] },
      ])
      const res = await getArchivedGoals()
      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", status: "archived" } })
      )
      expect(res).toEqual([{ id: "g1", taskTotal: 1, taskCompleted: 1 }])
    })

    it("returns [] without a session", async () => {
      const { getArchivedGoals } = require("@/app/actions/goals")
      mockAuth.mockResolvedValue(null)
      expect(await getArchivedGoals()).toEqual([])
    })
  })

  describe("getGoalTasks", () => {
    it("returns the caller's tasks linked to the goal", async () => {
      const { getGoalTasks } = require("@/app/actions/goals")
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.task.findMany as jest.Mock).mockResolvedValue([
        { id: "t1", title: "Chapter 1", status: "todo", dueDate: null },
      ])
      const res = await getGoalTasks("g1")
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", goalId: "g1", status: { not: "wont-do" }, recurrenceId: null },
        })
      )
      expect(res).toEqual([{ id: "t1", title: "Chapter 1", status: "todo", dueDate: null }])
    })

    it("returns [] without a session", async () => {
      const { getGoalTasks } = require("@/app/actions/goals")
      mockAuth.mockResolvedValue(null)
      expect(await getGoalTasks("g1")).toEqual([])
    })
  })

  describe("getGoalOptions", () => {
    it("returns lightweight active/achieved options", async () => {
      const { getGoalOptions } = require("@/app/actions/goals")
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findMany as jest.Mock).mockResolvedValue([{ id: "g1", title: "Read", icon: "🎯" }])
      const res = await getGoalOptions()
      expect(mockPrisma.goal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", status: { not: "archived" } },
          select: { id: true, title: true, icon: true },
        })
      )
      expect(res).toEqual([{ id: "g1", title: "Read", icon: "🎯" }])
    })
  })

  describe("createGoal", () => {
    it("returns unauthorized without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await createGoal({ title: "Read 12 books" })).toEqual({ error: "Unauthorized" })
    })

    it("validates the title", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await createGoal({ title: "" })).toEqual({ error: "Invalid input", details: expect.any(Array) })
    })

    it("creates a goal with seeded order and defaults", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.create as jest.Mock).mockResolvedValue({ id: "g1" })
      await createGoal({ title: "Read 12 books" })
      const data = (mockPrisma.goal.create as jest.Mock).mock.calls[0][0].data
      expect(data).toEqual(
        expect.objectContaining({
          title: "Read 12 books",
          icon: "🎯",
          color: "primary",
          progressType: "manual",
          currentValue: 0,
          manualProgress: 0,
          status: "active",
          order: 10,
          userId: "u1",
          targetDate: null,
        })
      )
    })

    it("converts a yyyy-mm-dd target date to a UTC-midnight Date", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.create as jest.Mock).mockResolvedValue({ id: "g1" })
      await createGoal({ title: "Ship v1", targetDate: "2026-12-31" })
      const td = (mockPrisma.goal.create as jest.Mock).mock.calls[0][0].data.targetDate as Date
      expect(td.getUTCFullYear()).toBe(2026)
      expect(td.getUTCMonth()).toBe(11)
      expect(td.getUTCDate()).toBe(31)
    })
  })

  describe("updateGoal", () => {
    it("verifies ownership", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue(null)
      expect(await updateGoal("g1", { title: "X" })).toEqual({ error: "Goal not found" })
    })

    it("patches only the provided fields", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1" })
      ;(mockPrisma.goal.update as jest.Mock).mockResolvedValue({})
      await updateGoal("g1", { title: "New title" })
      expect((mockPrisma.goal.update as jest.Mock).mock.calls[0][0].data).toEqual({ title: "New title" })
    })

    it("clears the target date when passed null", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1" })
      ;(mockPrisma.goal.update as jest.Mock).mockResolvedValue({})
      await updateGoal("g1", { targetDate: null })
      expect((mockPrisma.goal.update as jest.Mock).mock.calls[0][0].data).toEqual({ targetDate: null })
    })
  })

  describe("adjustGoalProgress", () => {
    it("moves currentValue for a numeric goal (clamped at 0)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1", progressType: "numeric", currentValue: 2 })
      ;(mockPrisma.goal.update as jest.Mock).mockResolvedValue({})
      await adjustGoalProgress("g1", -5)
      expect((mockPrisma.goal.update as jest.Mock).mock.calls[0][0].data).toEqual({ currentValue: 0 })
    })

    it("moves manualProgress for a manual goal (clamped at 100)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1", progressType: "manual", manualProgress: 95 })
      ;(mockPrisma.goal.update as jest.Mock).mockResolvedValue({})
      await adjustGoalProgress("g1", 10)
      expect((mockPrisma.goal.update as jest.Mock).mock.calls[0][0].data).toEqual({ manualProgress: 100 })
    })

    it("rejects a non-finite or oversized delta before any DB call", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await adjustGoalProgress("g1", Infinity)).toEqual({ error: "Invalid input" })
      expect(await adjustGoalProgress("g1", 1e9)).toEqual({ error: "Invalid input" })
      expect(mockPrisma.goal.findFirst).not.toHaveBeenCalled()
    })

    it("is a no-op for a tasks-progress goal (progress is derived)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1", progressType: "tasks" })
      expect(await adjustGoalProgress("g1", 10)).toEqual({ success: true })
      expect(mockPrisma.goal.update).not.toHaveBeenCalled()
    })
  })

  describe("setGoalStatus / deleteGoal", () => {
    it("rejects an unknown status", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await setGoalStatus("g1", "bogus")).toEqual({ error: "Invalid input" })
      expect(mockPrisma.goal.findFirst).not.toHaveBeenCalled()
    })

    it("sets a valid status for an owned goal", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1" })
      ;(mockPrisma.goal.update as jest.Mock).mockResolvedValue({})
      expect(await setGoalStatus("g1", "achieved")).toEqual({ success: true })
      expect(mockPrisma.goal.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "achieved" } })
    })

    it("delete verifies ownership then removes", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.goal.findFirst as jest.Mock).mockResolvedValue({ id: "g1", userId: "u1" })
      ;(mockPrisma.goal.delete as jest.Mock).mockResolvedValue({})
      expect(await deleteGoal("g1")).toEqual({ success: true })
      expect(mockPrisma.goal.delete).toHaveBeenCalledWith({ where: { id: "g1" } })
    })
  })
})
