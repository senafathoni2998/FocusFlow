/**
 * Unit tests for src/app/actions/savedFilters.ts (saved-view CRUD).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    savedFilter: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

import {
  getSavedFilters,
  createSavedFilter,
  deleteSavedFilter,
} from "@/app/actions/savedFilters"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("SavedFilter Actions", () => {
  const session = { user: { id: "user-1" } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockPrisma.savedFilter.aggregate as jest.Mock).mockResolvedValue({ _max: { order: null } })
  })

  describe("getSavedFilters", () => {
    it("returns [] without a session and never queries", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getSavedFilters()).toEqual([])
      expect(mockPrisma.savedFilter.findMany).not.toHaveBeenCalled()
    })

    it("returns the user's saved filters, session-scoped", async () => {
      mockAuth.mockResolvedValue(session)
      const rows = [{ id: "s1", name: "Work", query: "priority=high" }]
      ;(mockPrisma.savedFilter.findMany as jest.Mock).mockResolvedValue(rows)

      expect(await getSavedFilters()).toEqual(rows)
      expect(mockPrisma.savedFilter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      )
    })
  })

  describe("createSavedFilter", () => {
    it("rejects without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await createSavedFilter({ name: "Work", query: "" })).toEqual({
        error: "Unauthorized",
      })
    })

    it("rejects a blank name", async () => {
      mockAuth.mockResolvedValue(session)
      const res = await createSavedFilter({ name: "   ", query: "" })
      expect(res).toEqual(expect.objectContaining({ error: "Invalid input" }))
      expect(mockPrisma.savedFilter.create).not.toHaveBeenCalled()
    })

    it("canonicalizes the stored query (whitelist + order) and seeds order", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.savedFilter.aggregate as jest.Mock).mockResolvedValue({ _max: { order: 20 } })
      ;(mockPrisma.savedFilter.create as jest.Mock).mockResolvedValue({
        id: "s2",
        name: "High this month",
        query: "horizon=thisMonth&priority=high",
      })

      const res = await createSavedFilter({
        name: "High this month",
        query: "priority=high&junk=1&horizon=thisMonth",
      })

      expect(res).toEqual(
        expect.objectContaining({ success: true, savedFilter: expect.any(Object) })
      )
      expect(mockPrisma.savedFilter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "High this month",
            query: "horizon=thisMonth&priority=high",
            order: 30,
            userId: "user-1",
          }),
        })
      )
    })

    it("maps a duplicate-name unique violation to a friendly error", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.savedFilter.create as jest.Mock).mockRejectedValue({ code: "P2002" })

      const res = await createSavedFilter({ name: "Work", query: "" })
      expect(res).toEqual({ error: "A saved view with that name already exists" })
    })
  })

  describe("deleteSavedFilter", () => {
    it("rejects without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await deleteSavedFilter("s1")).toEqual({ error: "Unauthorized" })
    })

    it("returns not-found for another user's (or missing) filter", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.savedFilter.findFirst as jest.Mock).mockResolvedValue(null)

      expect(await deleteSavedFilter("s1")).toEqual({ error: "Saved filter not found" })
      // The ownership lookup must be scoped to the session user (no IDOR).
      expect(mockPrisma.savedFilter.findFirst).toHaveBeenCalledWith({
        where: { id: "s1", userId: "user-1" },
      })
      expect(mockPrisma.savedFilter.delete).not.toHaveBeenCalled()
    })

    it("deletes an owned filter", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.savedFilter.findFirst as jest.Mock).mockResolvedValue({ id: "s1", userId: "user-1" })
      ;(mockPrisma.savedFilter.delete as jest.Mock).mockResolvedValue({})

      expect(await deleteSavedFilter("s1")).toEqual({ success: true })
      expect(mockPrisma.savedFilter.delete).toHaveBeenCalledWith({ where: { id: "s1" } })
    })
  })
})
