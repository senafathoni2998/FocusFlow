/**
 * Unit tests for src/app/actions/tags.ts (getTags + deleteTag).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

import { getTags, deleteTag } from "@/app/actions/tags"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockAuth = auth as jest.MockedFunction<typeof auth>

describe("Tag Actions", () => {
  const session = { user: { id: "user-1" } } as any

  beforeEach(() => jest.clearAllMocks())

  describe("getTags", () => {
    it("returns [] without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getTags()).toEqual([])
    })

    it("returns the user's tags ordered", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.tag.findMany as jest.Mock).mockResolvedValue([{ id: "t1", name: "work" }])

      const res = await getTags()

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      })
      expect(res).toEqual([{ id: "t1", name: "work" }])
    })
  })

  describe("deleteTag", () => {
    it("returns unauthorized without a session", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await deleteTag("t1")).toEqual({ error: "Unauthorized" })
    })

    it("verifies ownership before deleting", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.tag.findFirst as jest.Mock).mockResolvedValue(null)

      const res = await deleteTag("t1")

      expect(mockPrisma.tag.delete).not.toHaveBeenCalled()
      expect(res).toEqual({ error: "Tag not found" })
    })

    it("deletes an owned tag (cascades TaskTag rows)", async () => {
      mockAuth.mockResolvedValue(session)
      ;(mockPrisma.tag.findFirst as jest.Mock).mockResolvedValue({ id: "t1", userId: "user-1" })
      ;(mockPrisma.tag.delete as jest.Mock).mockResolvedValue({ id: "t1" })

      expect(await deleteTag("t1")).toEqual({ success: true })
      expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: "t1" } })
    })
  })
})
