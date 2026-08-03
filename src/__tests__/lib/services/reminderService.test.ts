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
import { DUE_REMINDER_TAKE, DUE_REMINDER_STALE_MS } from "@/lib/reminderWindow"

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

  it("bounds the poll the same way the web action does", async () => {
    // Both paths share dueReminderWhere/DUE_REMINDER_TAKE. They used to diverge:
    // the web query was capped after a backlog produced a wall of banners, but
    // this service — the one the Android notification poller calls — kept the
    // unbounded form, so the phone got exactly the burst the web fix prevented.
    await getDueReminders("u1")

    const arg = prisma.reminder.findMany.mock.calls[0][0]
    expect(arg.take).toBe(DUE_REMINDER_TAKE)
    expect(arg.where.triggerAt.gte).toBeInstanceOf(Date)

    // The floor is a day back from the ceiling.
    const { gte, lte } = arg.where.triggerAt as { gte: Date; lte: Date }
    expect(lte.getTime() - gte.getTime()).toBe(DUE_REMINDER_STALE_MS)
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

  it("rejects a malformed payload instead of reporting a phantom success", async () => {
    // A wrong-typed payload used to collapse to `ids: []` and answer
    // `{ success: true, count: 0 }` — indistinguishable from a legitimately empty
    // request, so a client with the wrong shape believed dispatch had worked
    // while the reminders stayed undispatched and re-fired on every poll.
    for (const bad of ["nope", { ids: "r1" }, { ids: [1, 2] }]) {
      await expect(markRemindersDispatched("u1", bad)).rejects.toMatchObject({ status: 400 })
    }
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
  })

  it("still treats a genuinely empty request as a no-op success", async () => {
    // `ids` defaults to [], so an absent key on a real object is a valid
    // "nothing to dispatch". A non-object body is not — readJson rejects an
    // empty request before it ever reaches here.
    for (const empty of [{}, { ids: [] }]) {
      await expect(markRemindersDispatched("u1", empty)).resolves.toEqual({
        success: true,
        count: 0,
      })
    }
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
  })
})
