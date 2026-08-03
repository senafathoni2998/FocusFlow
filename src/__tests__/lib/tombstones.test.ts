/**
 * @jest-environment node
 *
 * Tombstones are how an offline client learns something was deleted. The design
 * choice they encode — real deletes plus a record, rather than a `deletedAt`
 * column filtered in every query — is what makes "a query forgot the filter and
 * served deleted rows" impossible here. These pin the behaviour that choice
 * depends on.
 */
import { recordTombstone, clearTombstone } from "@/lib/tombstones"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

beforeEach(() => {
  jest.resetAllMocks()
  prisma.tombstone = { upsert: jest.fn(), deleteMany: jest.fn() }
  prisma.$transaction = jest.fn().mockResolvedValue([])
  jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("recordTombstone", () => {
  it("upserts one row per id, scoped to the owner", async () => {
    await recordTombstone("u1", "task", ["t1", "t2"])

    expect(prisma.tombstone.upsert).toHaveBeenCalledTimes(2)
    const first = prisma.tombstone.upsert.mock.calls[0][0]
    expect(first.where).toEqual({
      userId_entityType_entityId: { userId: "u1", entityType: "task", entityId: "t1" },
    })
    expect(first.create).toEqual({ userId: "u1", entityType: "task", entityId: "t1" })
  })

  it("refreshes deletedAt when an id is deleted, recreated and deleted again", async () => {
    // Reporting the FIRST deletion would let a client that synced in between
    // miss the second one entirely.
    await recordTombstone("u1", "task", "t1")

    expect(prisma.tombstone.upsert.mock.calls[0][0].update.deletedAt).toBeInstanceOf(Date)
  })

  it("writes every id in one transaction", async () => {
    await recordTombstone("u1", "task", ["t1", "t2", "t3"])
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it("does nothing for an empty or blank id list", async () => {
    await recordTombstone("u1", "task", [])
    await recordTombstone("u1", "task", ["", ""])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("never throws — the row is already gone by the time it runs", async () => {
    // Failing here would turn a successful delete into an error the user sees,
    // for bookkeeping whose worst case is one stale row until a full refresh.
    prisma.$transaction.mockRejectedValue(new Error("db down"))
    await expect(recordTombstone("u1", "task", "t1")).resolves.toBeUndefined()
  })
})

describe("clearTombstone", () => {
  it("removes the record for an id that exists again", async () => {
    await clearTombstone("u1", "task", "t1")
    expect(prisma.tombstone.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", entityType: "task", entityId: "t1" },
    })
  })

  it("never throws, for the same reason as recordTombstone", async () => {
    prisma.tombstone.deleteMany.mockRejectedValue(new Error("db down"))
    await expect(clearTombstone("u1", "task", "t1")).resolves.toBeUndefined()
  })
})
