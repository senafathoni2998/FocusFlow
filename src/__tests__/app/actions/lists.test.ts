/**
 * Unit tests for src/app/actions/lists.ts (List CRUD).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    list: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

import { createList, updateList, deleteList, getLists, reorderList } from "@/app/actions/lists"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("List Actions", () => {
  const session = { user: { id: "user-1" } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockPrisma.list.aggregate as jest.Mock).mockResolvedValue({ _max: { order: null } })
  })

  describe("createList", () => {
    it("returns unauthorized without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await createList({ name: "Work" })).toEqual({ error: "Unauthorized" })
    })

    it("validates the name", async () => {
      mockAuth.mockResolvedValue(session)
      expect(await createList({ name: "" })).toEqual({
        error: "Invalid input",
        details: expect.any(Array),
      })
    })

    it("creates a list with a seeded order under the current user", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.create as jest.Mock).mockResolvedValue({ id: "l1", name: "Work" })

      const res = await createList({ name: "Work", color: "#f00" })

      expect(mockPrisma.list.create).toHaveBeenCalledWith({
        data: { name: "Work", color: "#f00", order: 10, userId: "user-1" },
      })
      expect(res).toEqual({ success: true, list: { id: "l1", name: "Work" } })
    })
  })

  describe("updateList", () => {
    it("returns not found for a list the user doesn't own", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue(null)
      expect(await updateList("l1", { name: "X" })).toEqual({ error: "List not found" })
    })

    it("renames a list (trimming whitespace)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue({ id: "l1", userId: "user-1" })
      ;(mockPrisma.list.update as jest.Mock).mockResolvedValue({ id: "l1", name: "New" })

      await updateList("l1", { name: "  New  " })

      expect(mockPrisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { name: "New" } })
    })

    it("rejects an empty rename", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue({ id: "l1", userId: "user-1" })
      expect(await updateList("l1", { name: "   " })).toEqual({ error: "List name is required" })
    })
  })

  describe("deleteList", () => {
    it("verifies ownership before deleting", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue(null)

      const res = await deleteList("l1")

      expect(mockPrisma.list.delete).not.toHaveBeenCalled()
      expect(res).toEqual({ error: "List not found" })
    })

    it("deletes an owned list (tasks fall back to Inbox via SetNull)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue({ id: "l1", userId: "user-1" })
      ;(mockPrisma.list.delete as jest.Mock).mockResolvedValue({ id: "l1" })

      expect(await deleteList("l1")).toEqual({ success: true })
      expect(mockPrisma.list.delete).toHaveBeenCalledWith({ where: { id: "l1" } })
    })
  })

  describe("getLists", () => {
    it("returns [] without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getLists()).toEqual([])
    })

    it("returns the user's lists ordered", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findMany as jest.Mock).mockResolvedValue([{ id: "l1" }])

      const res = await getLists()

      expect(mockPrisma.list.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      })
      expect(res).toEqual([{ id: "l1" }])
    })

    it("is always scoped to the authenticated user (no userId param)", async () => {
      expect(getLists.length).toBe(0)
    })
  })

  describe("reorderList", () => {
    it("updates order for an owned list", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.list.findFirst as jest.Mock).mockResolvedValue({ id: "l1", userId: "user-1" })
      ;(mockPrisma.list.update as jest.Mock).mockResolvedValue({ id: "l1", order: 5 })

      await reorderList("l1", 5)

      expect(mockPrisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { order: 5 } })
    })
  })
})
