/**
 * Unit tests for src/app/actions/habits.ts
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    habit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    habitCheckIn: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

import {
  getHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  deleteHabit,
  checkInHabit,
} from "@/app/actions/habits"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("Habit Actions", () => {
  const session = { user: { id: "u1" } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockPrisma.habit.aggregate as jest.Mock).mockResolvedValue({ _max: { order: null } })
  })

  describe("getHabits", () => {
    it("returns [] without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getHabits()).toEqual([])
    })

    it("returns the user's active habits with check-ins", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findMany as jest.Mock).mockResolvedValue([{ id: "h1" }])
      const res = await getHabits()
      expect(mockPrisma.habit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", archived: false },
          include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
        })
      )
      expect(res).toEqual([{ id: "h1" }])
    })
  })

  describe("createHabit", () => {
    it("returns unauthorized without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await createHabit({ name: "Read" })).toEqual({ error: "Unauthorized" })
    })

    it("validates the name", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await createHabit({ name: "" })).toEqual({ error: "Invalid input", details: expect.any(Array) })
    })

    it("creates a habit with seeded order and defaults", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.create as jest.Mock).mockResolvedValue({ id: "h1", name: "Read" })
      const res = await createHabit({ name: "Read" })
      const data = (mockPrisma.habit.create as jest.Mock).mock.calls[0][0].data
      expect(data).toEqual(
        expect.objectContaining({ name: "Read", icon: "✅", color: "primary", goalType: "achieve", order: 10, userId: "u1" })
      )
      expect(res).toEqual({ success: true, habit: { id: "h1", name: "Read" } })
    })
  })

  describe("updateHabit / archiveHabit / deleteHabit", () => {
    it("update verifies ownership", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue(null)
      expect(await updateHabit("h1", { name: "X" })).toEqual({ error: "Habit not found" })
    })

    it("archive toggles the flag for an owned habit", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1" })
      ;(mockPrisma.habit.update as jest.Mock).mockResolvedValue({})
      await archiveHabit("h1", true)
      expect(mockPrisma.habit.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: { archived: true } })
    })

    it("delete verifies ownership then cascades", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1" })
      ;(mockPrisma.habit.delete as jest.Mock).mockResolvedValue({})
      expect(await deleteHabit("h1")).toEqual({ success: true })
      expect(mockPrisma.habit.delete).toHaveBeenCalledWith({ where: { id: "h1" } })
    })
  })

  describe("checkInHabit", () => {
    it("rejects a habit the user doesn't own", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue(null)
      expect(await checkInHabit({ habitId: "h1" })).toEqual({ error: "Habit not found" })
    })

    it("creates a check-in (delta +1)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1", goalType: "achieve" })
      ;(mockPrisma.habitCheckIn.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.habitCheckIn.upsert as jest.Mock).mockResolvedValue({})
      await checkInHabit({ habitId: "h1" })
      const call = (mockPrisma.habitCheckIn.upsert as jest.Mock).mock.calls[0][0]
      expect(call.create.amount).toBe(1)
      expect(call.update.amount).toBe(1)
    })

    it("removes the check-in when it drops to 0 (undo)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1", goalType: "achieve" })
      ;(mockPrisma.habitCheckIn.findUnique as jest.Mock).mockResolvedValue({ id: "c1", amount: 1 })
      await checkInHabit({ habitId: "h1", delta: -1 })
      expect(mockPrisma.habitCheckIn.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
      expect(mockPrisma.habitCheckIn.upsert).not.toHaveBeenCalled()
    })

    it("increments an amount check-in", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1", goalType: "amount", targetAmount: 8 })
      ;(mockPrisma.habitCheckIn.findUnique as jest.Mock).mockResolvedValue({ id: "c1", amount: 2 })
      ;(mockPrisma.habitCheckIn.upsert as jest.Mock).mockResolvedValue({})
      await checkInHabit({ habitId: "h1", delta: 1 })
      expect((mockPrisma.habitCheckIn.upsert as jest.Mock).mock.calls[0][0].update.amount).toBe(3)
    })

    it("rejects a far-future date without touching the DB", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.habit.findFirst as jest.Mock).mockResolvedValue({ id: "h1", userId: "u1", goalType: "achieve" })
      expect(await checkInHabit({ habitId: "h1", date: "2099-01-01" })).toEqual({ error: "Invalid date" })
      expect(mockPrisma.habitCheckIn.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.habitCheckIn.upsert).not.toHaveBeenCalled()
    })

    it("rejects a malformed date and a non-integer delta", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await checkInHabit({ habitId: "h1", date: "07/04/2026" } as any)).toEqual(
        expect.objectContaining({ error: "Invalid input" })
      )
      expect(await checkInHabit({ habitId: "h1", delta: 0.5 } as any)).toEqual(
        expect.objectContaining({ error: "Invalid input" })
      )
    })
  })
})
