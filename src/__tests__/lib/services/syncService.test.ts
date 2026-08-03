/**
 * @jest-environment node
 *
 * Delta sync. The interesting behaviour is all cursor arithmetic: a cursor that
 * skips a row loses it silently and forever, which is the failure this endpoint
 * exists to avoid.
 */
import { getChanges, parseSince } from "@/lib/services/syncService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

const NOW = new Date("2026-08-03T12:00:00.000Z")

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(NOW)
  prisma.tombstone = { findMany: jest.fn().mockResolvedValue([]) }
  prisma.savedFilter = { findMany: jest.fn().mockResolvedValue([]) }
  for (const m of ["task", "list", "tag", "habit", "goal", "focusSession"]) {
    prisma[m] = { ...(prisma[m] ?? {}), findMany: jest.fn().mockResolvedValue([]) }
  }
})

afterEach(() => jest.useRealTimers())

describe("parseSince", () => {
  it("treats a missing cursor as a first, full sync", () => {
    expect(parseSince(null)).toBeNull()
    expect(parseSince("")).toBeNull()
  })

  it("rejects a cursor that is not a timestamp", () => {
    expect(() => parseSince("yesterday")).toThrow()
  })

  it("rejects a cursor from the future, which would return nothing forever", () => {
    const ahead = new Date(NOW.getTime() + 10 * 60_000).toISOString()
    expect(() => parseSince(ahead)).toThrow()
  })

  it("subtracts an overlap so a row written in the same instant is not skipped", () => {
    // Two writes in one transaction can land microseconds apart; resuming at
    // exactly the previous serverTime can fall between them. Re-sending is free
    // because the client upserts by id.
    const since = parseSince("2026-08-03T11:00:00.000Z")!
    expect(since.toISOString()).toBe("2026-08-03T10:59:59.000Z")
  })
})

describe("getChanges", () => {
  it("scopes every collection to the caller", async () => {
    await getChanges("u1", null)

    for (const m of ["task", "list", "tag", "habit", "goal", "savedFilter", "focusSession"]) {
      expect(prisma[m].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }),
      )
    }
  })

  it("marks a cursor-less request as full and asks for no updatedAt window", async () => {
    const res = await getChanges("u1", null)

    expect(res.full).toBe(true)
    expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" })
  })

  it("skips tombstones entirely on a first sync", async () => {
    // The client is starting empty, so every deletion the account ever recorded
    // would be noise.
    const res = await getChanges("u1", null)

    expect(prisma.tombstone.findMany).not.toHaveBeenCalled()
    expect(res.deleted).toEqual([])
  })

  it("filters by updatedAt and returns tombstones once a cursor is given", async () => {
    const since = new Date("2026-08-03T11:00:00.000Z")
    prisma.tombstone.findMany.mockResolvedValue([
      { entityType: "task", entityId: "t9", deletedAt: since },
    ])

    const res = await getChanges("u1", since)

    expect(res.full).toBe(false)
    expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      updatedAt: { gte: since },
    })
    expect(prisma.tombstone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", deletedAt: { gte: since } } }),
    )
    expect(res.deleted).toEqual([{ entityType: "task", entityId: "t9", deletedAt: since }])
  })

  it("stamps serverTime from BEFORE the reads", async () => {
    // Taking it afterwards would advance the next cursor past rows written while
    // these queries ran, losing them permanently.
    const res = await getChanges("u1", null)
    expect(res.serverTime).toBe(NOW.toISOString())
  })

  it("flattens task tags, so the client sees tag rows not join rows", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: "t1", tags: [{ tag: { id: "g1", name: "work" } }] },
    ])

    const res = await getChanges("u1", null)

    expect(res.changed.tasks[0].tags).toEqual([{ id: "g1", name: "work" }])
  })
})
