/**
 * Unit tests for src/app/actions/reminders.ts
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    reminder: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))

import { getDueReminders, markRemindersDispatched } from "@/app/actions/reminders"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("Reminder Actions", () => {
  const session = { user: { id: "u1" } } as any
  beforeEach(() => jest.clearAllMocks())

  describe("getDueReminders", () => {
    it("returns [] without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getDueReminders()).toEqual([])
    })

    it("queries the user's fired-and-undispatched reminders", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.reminder.findMany as jest.Mock).mockResolvedValue([{ id: "r1" }])
      const res = await getDueReminders()
      const arg = (mockPrisma.reminder.findMany as jest.Mock).mock.calls[0][0]
      expect(arg.where.userId).toBe("u1")
      expect(arg.where.dispatchedAt).toBeNull()
      expect(arg.where.triggerAt.lte).toBeInstanceOf(Date)
      expect(res).toEqual([{ id: "r1" }])
    })
  })

  describe("markRemindersDispatched", () => {
    it("is unauthorized without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await markRemindersDispatched(["r1"])).toEqual({ error: "Unauthorized" })
    })

    it("no-ops on empty ids without touching the DB", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await markRemindersDispatched([])).toEqual({ success: true, count: 0 })
      expect(mockPrisma.reminder.updateMany).not.toHaveBeenCalled()
    })

    it("marks only the caller's reminders dispatched", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.reminder.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
      const res = await markRemindersDispatched(["r1", "r2"])
      const arg = (mockPrisma.reminder.updateMany as jest.Mock).mock.calls[0][0]
      expect(arg.where.userId).toBe("u1")
      expect(arg.where.id).toEqual({ in: ["r1", "r2"] })
      expect(arg.data.dispatchedAt).toBeInstanceOf(Date)
      expect(res).toEqual({ success: true, count: 2 })
    })
  })
})
