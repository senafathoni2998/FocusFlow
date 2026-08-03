/**
 * @jest-environment node
 *
 * reminderService: the mobile API's reminder-dispatch queries. The rules that
 * matter here are all about scoping — the due query must only ever see the
 * caller's own undispatched, already-fired reminders, and the dispatch write must
 * be constrained by userId so a foreign id is a silent no-op rather than a write.
 * Prisma is the global mock, extended here with the `reminder` model.
 */
import { getDueReminders, markRemindersDispatched } from "@/lib/services/reminderService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

const NOW = new Date("2026-08-03T12:00:00.000Z")

beforeEach(() => {
  jest.resetAllMocks()
  prisma.reminder = {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  }
  jest.useFakeTimers().setSystemTime(NOW)
})

afterEach(() => {
  jest.useRealTimers()
})

describe("reminderService.getDueReminders", () => {
  it("asks only for the user's own undispatched reminders that have already fired", async () => {
    await getDueReminders("u1")

    const { where } = prisma.reminder.findMany.mock.calls[0][0]
    expect(where.userId).toBe("u1")
    expect(where.dispatchedAt).toBeNull() // never re-surface an already-delivered one
    expect(where.triggerAt.lte).toEqual(NOW) // future reminders stay hidden
  })

  it("returns them soonest-first with the parent task's id and title joined in", async () => {
    const rows = [
      { id: "r1", triggerAt: new Date("2026-08-03T09:00:00.000Z"), task: { id: "t1", title: "Ship it" } },
    ]
    prisma.reminder.findMany.mockResolvedValue(rows)

    await expect(getDueReminders("u1")).resolves.toEqual(rows)

    const arg = prisma.reminder.findMany.mock.calls[0][0]
    expect(arg.orderBy).toEqual({ triggerAt: "asc" })
    expect(arg.include).toEqual({ task: { select: { id: true, title: true } } })
  })

  it("currently applies NO row cap and NO staleness floor, unlike the web action", async () => {
    // The server action in src/app/actions/reminders.ts deliberately bounds this
    // query (`take: 5` + a 24h `gte` floor) because an unbounded poll dumped weeks
    // of missed reminders at once. This service does neither — asserted so the
    // divergence is visible and a future fix trips this test on purpose.
    await getDueReminders("u1")

    const arg = prisma.reminder.findMany.mock.calls[0][0]
    expect(arg.take).toBeUndefined()
    expect(arg.where.triggerAt.gte).toBeUndefined()
  })

  it("lets a Prisma failure propagate to handleRoute rather than masking it as empty", async () => {
    prisma.reminder.findMany.mockRejectedValue(new Error("db down"))
    await expect(getDueReminders("u1")).rejects.toThrow("db down")
  })
})

describe("reminderService.markRemindersDispatched", () => {
  it("scopes the update to the caller so a foreign id is a silent no-op, not an error", async () => {
    // updateMany matched nothing because the row belongs to someone else.
    prisma.reminder.updateMany.mockResolvedValue({ count: 0 })

    await expect(markRemindersDispatched("u1", { ids: ["someone-elses-reminder"] })).resolves.toEqual({
      success: true,
      count: 0,
    })

    const { where, data } = prisma.reminder.updateMany.mock.calls[0][0]
    expect(where.userId).toBe("u1")
    expect(where.id).toEqual({ in: ["someone-elses-reminder"] })
    expect(data.dispatchedAt).toEqual(NOW)
  })

  it("reports the number of rows actually claimed, not the number of ids sent", async () => {
    // Two of the three ids were the caller's; the third was not.
    prisma.reminder.updateMany.mockResolvedValue({ count: 2 })

    await expect(markRemindersDispatched("u1", { ids: ["a", "b", "foreign"] })).resolves.toEqual({
      success: true,
      count: 2,
    })
  })

  it("writes nothing for an empty id list", async () => {
    await expect(markRemindersDispatched("u1", { ids: [] })).resolves.toEqual({ success: true, count: 0 })
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
  })

  it("caps a flood of ids at 500 per call", async () => {
    const ids = Array.from({ length: 600 }, (_, i) => `r${i}`)
    prisma.reminder.updateMany.mockResolvedValue({ count: 500 })

    await markRemindersDispatched("u1", { ids })

    const sent = prisma.reminder.updateMany.mock.calls[0][0].where.id.in
    expect(sent).toHaveLength(500)
    expect(sent[499]).toBe("r499")
  })

  it("silently succeeds on malformed input instead of rejecting it", async () => {
    // safeParse failures collapse to `ids: []`, so a wrong-typed payload looks
    // identical to an empty one from the client's side. Current behaviour.
    for (const bad of [undefined, null, "nope", { ids: "r1" }, { ids: [1, 2] }, {}]) {
      await expect(markRemindersDispatched("u1", bad)).resolves.toEqual({ success: true, count: 0 })
    }
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
  })
})
