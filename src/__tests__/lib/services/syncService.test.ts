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

describe("the payload shape matches the list endpoints", () => {
  // Delta sync only works if a client can merge `changed.*` into what it already
  // has from GET /tasks, /habits, /goals. Sync used to return RAW Prisma rows, so
  // merging one silently degraded it — these are the four fields that broke.

  it("serialises a task exactly as GET /tasks does", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "t1",
        userId: "u1",
        title: "Buy milk",
        dueDate: new Date("2026-08-04T00:00:00.000Z"),
        startDate: null,
        tags: [{ tag: { id: "tag1", name: "errands" } }],
        recurrence: null,
        reminders: [],
      },
    ])
    prisma.focusSession.findMany.mockResolvedValue([
      {
        taskId: "t1",
        startTime: new Date("2026-08-03T10:00:00.000Z"),
        endTime: new Date("2026-08-03T10:25:00.000Z"),
      },
    ])

    const out = await getChanges("u1", null)
    const task = out.changed.tasks[0] as Record<string, unknown>

    // A bare calendar day, not an instant. Sending the instant makes a phone in
    // another timezone render the previous or next DAY — the exact shift the
    // yyyy-MM-dd convention exists to prevent.
    expect(typeof task.dueDate).toBe("string")
    expect(task.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Derived from completed pomodoros. Absent, the estimate-vs-actual pill on
    // every synced task reads 0.
    expect(task.actualMin).toBe(25)

    // Tags flattened out of the join rows.
    expect(task.tags).toEqual([{ id: "tag1", name: "errands" }])
  })

  it("attaches habit stats, so a merge cannot blank a streak", async () => {
    prisma.habit.findMany.mockResolvedValue([
      { id: "h1", userId: "u1", name: "Read", frequency: "daily", target: 1, checkIns: [] },
    ])
    prisma.habitCheckIn = {
      ...(prisma.habitCheckIn ?? {}),
      groupBy: jest.fn().mockResolvedValue([]),
    }

    const out = await getChanges("u1", null)
    const habit = out.changed.habits[0] as Record<string, unknown>
    expect(habit.stats).toBeDefined()
    // And the 1200 check-in rows fetched to compute it are NOT shipped.
    expect(habit.checkIns).toBeUndefined()
  })

  it("attaches goal progress, so a merge cannot show every goal at 0%", async () => {
    prisma.goal.findMany.mockResolvedValue([
      {
        id: "g1",
        userId: "u1",
        title: "Read 12 books",
        progressType: "manual",
        manualProgress: 40,
        tasks: [],
      },
    ])

    const out = await getChanges("u1", null)
    const goal = out.changed.goals[0] as Record<string, unknown>
    expect(goal.progress).toBeDefined()
    expect(goal.taskTotal).toBe(0)
    expect(goal.tasks).toBeUndefined()
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
