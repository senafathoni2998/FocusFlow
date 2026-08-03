/**
 * habitService: the mobile API's habit domain logic. Exercises the shared
 * listHabits projection (stats computed FROM check-ins, check-ins kept OUT of the
 * payload), create defaults, ownership checks on every mutation, and checkInHabit's
 * delta/clamp semantics and UTC-day keying — against the global Prisma mock,
 * extended here with the models this service uses.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

import {
  getHabits,
  getArchivedHabits,
  createHabit,
  updateHabit,
  archiveHabit,
  deleteHabit,
  checkInHabit,
} from "@/lib/services/habitService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

/** A UTC-midnight Date for a local calendar day `offset` days from today. */
function utcDayFromLocalOffset(offset = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** yyyy-mm-dd for a local calendar day `offset` days from today. */
function localDateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) also drains mockResolvedValueOnce queues.
  jest.resetAllMocks()
  prisma.habit = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue({ _max: { order: 20 } }),
  }
  prisma.habitCheckIn = {
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    // satisfiedDayCounts: the exact lifetime total, counted rather than derived
    // from the capped check-in slice.
    groupBy: jest.fn().mockResolvedValue([]),
  }
})

describe("habitService.getHabits", () => {
  it("scopes to the user's ACTIVE habits and orders by explicit order", async () => {
    prisma.habit.findMany.mockResolvedValue([])

    await getHabits("u1")

    const arg = prisma.habit.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ userId: "u1", archived: false })
    expect(arg.orderBy).toEqual([{ order: "asc" }, { createdAt: "asc" }])
    expect(arg.include.checkIns.take).toBe(1200)
  })

  it("computes stats FROM check-ins but strips check-ins from the response", async () => {
    // Regression guard: shipping up to 1200 check-in rows per habit added ~1MB to
    // every Habits-tab response. `stats` must still be derived from them.
    const checkIns = [
      { id: "c1", date: utcDayFromLocalOffset(0), amount: 1 },
      { id: "c2", date: utcDayFromLocalOffset(-1), amount: 1 },
    ]
    prisma.habit.findMany.mockResolvedValue([
      {
        id: "h1",
        name: "Read",
        goalType: "achieve",
        targetAmount: 1,
        frequencyType: "daily",
        weekdays: [],
        archived: false,
        createdAt: new Date(Date.now() - 90 * 86400000),
        checkIns,
      },
    ])

    prisma.habitCheckIn.groupBy.mockResolvedValue([{ habitId: "h1", _count: { _all: 2 } }])

    const [habit] = await getHabits("u1")

    expect(habit).not.toHaveProperty("checkIns")
    expect(habit.stats.todayDone).toBe(true)
    expect(habit.stats.currentStreak).toBe(2)
    expect(habit.stats.totalDays).toBe(2)
    expect(habit.stats.streakUnit).toBe("day")
  })

  it("takes totalDays from the exact count, not the capped check-in slice", async () => {
    // checkIns is fetched with take:1200, so a habit older than that would report
    // a frozen lifetime total if the number were derived from the array. The
    // count says 1500 while the slice holds one row — the count must win.
    prisma.habit.findMany.mockResolvedValue([
      {
        id: "h1",
        name: "Read",
        goalType: "achieve",
        targetAmount: 1,
        frequencyType: "daily",
        weekdays: [],
        archived: false,
        createdAt: new Date(Date.now() - 2000 * 86400000),
        checkIns: [{ id: "c1", date: utcDayFromLocalOffset(0), amount: 1 }],
      },
    ])
    prisma.habitCheckIn.groupBy.mockResolvedValue([{ habitId: "h1", _count: { _all: 1500 } }])

    const [habit] = await getHabits("u1")

    expect(habit.stats.totalDays).toBe(1500)
  })

  it("counts only days that clear an amount habit's target", async () => {
    prisma.habit.findMany.mockResolvedValue([
      { id: "h1", name: "Water", goalType: "amount", targetAmount: 8, frequencyType: "daily", weekdays: [], archived: false, createdAt: new Date(), checkIns: [] },
    ])
    prisma.habitCheckIn.groupBy.mockResolvedValue([{ habitId: "h1", _count: { _all: 4 } }])

    await getHabits("u1")

    // The threshold is the habit's targetAmount, not a bare 1.
    expect(prisma.habitCheckIn.groupBy.mock.calls[0][0].where.amount).toEqual({ gte: 8 })
  })
})

describe("habitService.getArchivedHabits", () => {
  it("lists only ARCHIVED habits, most-recently-touched first", async () => {
    prisma.habit.findMany.mockResolvedValue([])

    await getArchivedHabits("u1")

    const arg = prisma.habit.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ userId: "u1", archived: true })
    expect(arg.orderBy).toEqual([{ updatedAt: "desc" }])
  })

  it("also strips check-ins while still attaching stats", async () => {
    prisma.habit.findMany.mockResolvedValue([
      {
        id: "h9",
        goalType: "achieve",
        frequencyType: "daily",
        weekdays: [],
        archived: true,
        checkIns: [{ id: "c1", date: utcDayFromLocalOffset(0), amount: 1 }],
      },
    ])

    const [habit] = await getArchivedHabits("u1")

    expect(habit).not.toHaveProperty("checkIns")
    expect(habit.stats.todayAmount).toBe(1)
  })
})

describe("habitService.createHabit", () => {
  it("applies defaults and appends at a spaced order for the calling user", async () => {
    prisma.habit.create.mockResolvedValue({ id: "h1" })

    await createHabit("u1", { name: "Meditate" })

    const data = prisma.habit.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      name: "Meditate",
      icon: "✅",
      color: "primary",
      frequencyType: "daily",
      weekdays: [],
      weeklyTarget: 1,
      goalType: "achieve",
      targetAmount: 1,
      order: 30, // max 20 + 10
      userId: "u1",
    })
  })

  it("rejects an empty name and a colour outside the allowed enum", async () => {
    await expect(createHabit("u1", { name: "" })).rejects.toBeDefined()
    await expect(createHabit("u1", { name: "Ok", color: "purple" })).rejects.toBeDefined()
    expect(prisma.habit.create).not.toHaveBeenCalled()
  })

  it("rejects a weekday outside 0-6 and a weeklyTarget above 7", async () => {
    await expect(createHabit("u1", { name: "Gym", weekdays: [7] })).rejects.toBeDefined()
    await expect(createHabit("u1", { name: "Gym", weeklyTarget: 8 })).rejects.toBeDefined()
    expect(prisma.habit.create).not.toHaveBeenCalled()
  })
})

describe("habitService.updateHabit", () => {
  it("404s when the habit belongs to someone else and never writes", async () => {
    prisma.habit.findFirst.mockResolvedValue(null)

    await expect(updateHabit("u1", "foreign", { name: "Hijack" })).rejects.toMatchObject({
      status: 404,
    })
    expect(prisma.habit.update).not.toHaveBeenCalled()
  })

  it("looks the habit up scoped to the user, then patches only the given fields", async () => {
    prisma.habit.findFirst.mockResolvedValue({ id: "h1" })

    await updateHabit("u1", "h1", { name: "Read more", color: "success" })

    expect(prisma.habit.findFirst).toHaveBeenCalledWith({ where: { id: "h1", userId: "u1" } })
    expect(prisma.habit.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { name: "Read more", color: "success" },
    })
  })

  it("rejects invalid partial input before writing", async () => {
    prisma.habit.findFirst.mockResolvedValue({ id: "h1" })

    await expect(updateHabit("u1", "h1", { targetAmount: -5 })).rejects.toBeDefined()
    expect(prisma.habit.update).not.toHaveBeenCalled()
  })
})

describe("habitService.archiveHabit", () => {
  it("archives when passed true", async () => {
    prisma.habit.findFirst.mockResolvedValue({ id: "h1" })

    await expect(archiveHabit("u1", "h1", true)).resolves.toEqual({ success: true })
    expect(prisma.habit.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { archived: true },
    })
  })

  it("UNarchives when passed false — archiving is not a one-way trip", async () => {
    prisma.habit.findFirst.mockResolvedValue({ id: "h1" })

    await archiveHabit("u1", "h1", false)

    expect(prisma.habit.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { archived: false },
    })
  })

  it("404s for a habit the caller does not own", async () => {
    prisma.habit.findFirst.mockResolvedValue(null)

    await expect(archiveHabit("u1", "foreign", true)).rejects.toMatchObject({ status: 404 })
    expect(prisma.habit.update).not.toHaveBeenCalled()
  })
})

describe("habitService.deleteHabit", () => {
  it("deletes only after an ownership check", async () => {
    prisma.habit.findFirst.mockResolvedValue({ id: "h1" })

    await expect(deleteHabit("u1", "h1")).resolves.toEqual({ success: true })
    expect(prisma.habit.findFirst).toHaveBeenCalledWith({ where: { id: "h1", userId: "u1" } })
    expect(prisma.habit.delete).toHaveBeenCalledWith({ where: { id: "h1" } })
  })

  it("404s and does not delete a habit owned by another user", async () => {
    prisma.habit.findFirst.mockResolvedValue(null)

    await expect(deleteHabit("u1", "foreign")).rejects.toMatchObject({ status: 404 })
    expect(prisma.habit.delete).not.toHaveBeenCalled()
  })
})

describe("habitService.checkInHabit", () => {
  const habitRow = {
    id: "h1",
    goalType: "achieve",
    targetAmount: 1,
    frequencyType: "daily",
    weekdays: [],
  }

  it("404s for a habit the caller does not own, before touching check-ins", async () => {
    prisma.habit.findFirst.mockResolvedValue(null)

    await expect(checkInHabit("u1", "foreign", {})).rejects.toMatchObject({ status: 404 })
    expect(prisma.habitCheckIn.findUnique).not.toHaveBeenCalled()
    expect(prisma.habitCheckIn.upsert).not.toHaveBeenCalled()
  })

  it("defaults to +1 on today's UTC-keyed day when no body is given", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    await checkInHabit("u1", "h1", {})

    const today = utcDayFromLocalOffset(0)
    expect(prisma.habitCheckIn.upsert).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: "h1", date: today } },
      update: { amount: 1 },
      create: { habitId: "h1", date: today, amount: 1 },
    })
  })

  it("adds the delta to an existing amount rather than replacing it", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue({ id: "c1", amount: 3 })

    await checkInHabit("u1", "h1", { delta: 2 })

    expect(prisma.habitCheckIn.upsert.mock.calls[0][0].update).toEqual({ amount: 5 })
  })

  it("deletes the check-in when a negative delta takes the amount to zero", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue({ id: "c1", amount: 1 })

    await checkInHabit("u1", "h1", { delta: -1 })

    expect(prisma.habitCheckIn.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
    expect(prisma.habitCheckIn.upsert).not.toHaveBeenCalled()
  })

  it("clamps at zero: an over-large negative delta never writes a negative amount", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue({ id: "c1", amount: 2 })

    await checkInHabit("u1", "h1", { delta: -50 })

    expect(prisma.habitCheckIn.delete).toHaveBeenCalledWith({ where: { id: "c1" } })
    expect(prisma.habitCheckIn.upsert).not.toHaveBeenCalled()
  })

  it("is a no-op write when decrementing a day that has no check-in", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    await checkInHabit("u1", "h1", { delta: -1 })

    expect(prisma.habitCheckIn.delete).not.toHaveBeenCalled()
    expect(prisma.habitCheckIn.upsert).not.toHaveBeenCalled()
  })

  it("keys an explicit yyyy-mm-dd to UTC midnight of that same calendar day", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    await checkInHabit("u1", "h1", { date: "2020-05-17" })

    const keyed = prisma.habitCheckIn.upsert.mock.calls[0][0].where.habitId_date.date
    expect(keyed.toISOString()).toBe("2020-05-17T00:00:00.000Z")
  })

  it("rejects a date beyond the tomorrow cutoff with a 400", async () => {
    prisma.habit.findFirst.mockResolvedValue(habitRow)

    await expect(
      checkInHabit("u1", "h1", { date: localDateStr(3) })
    ).rejects.toMatchObject({ status: 400 })
    expect(prisma.habitCheckIn.upsert).not.toHaveBeenCalled()
  })

  it("still allows tomorrow — the cutoff is inclusive, giving clients timezone slack", async () => {
    prisma.habit.findFirst
      .mockResolvedValueOnce(habitRow)
      .mockResolvedValueOnce({ ...habitRow, checkIns: [] })
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    await checkInHabit("u1", "h1", { date: localDateStr(1) })

    expect(prisma.habitCheckIn.upsert).toHaveBeenCalled()
  })

  it("rejects a malformed date and an out-of-range delta before any lookup", async () => {
    await expect(checkInHabit("u1", "h1", { date: "17-05-2020" })).rejects.toBeDefined()
    await expect(checkInHabit("u1", "h1", { delta: 5000 })).rejects.toBeDefined()
    await expect(checkInHabit("u1", "h1", { delta: 1.5 })).rejects.toBeDefined()
    expect(prisma.habit.findFirst).not.toHaveBeenCalled()
  })

  it("returns the habit with recomputed stats and WITHOUT its check-ins", async () => {
    prisma.habit.findFirst.mockResolvedValueOnce(habitRow).mockResolvedValueOnce({
      ...habitRow,
      createdAt: new Date(Date.now() - 90 * 86400000),
      checkIns: [{ id: "c1", date: utcDayFromLocalOffset(0), amount: 1 }],
    })
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    const res = await checkInHabit("u1", "h1", {})

    expect(res.success).toBe(true)
    expect(res.habit).not.toHaveProperty("checkIns")
    expect(res.habit?.stats.todayDone).toBe(true)
    expect(res.habit?.stats.todayAmount).toBe(1)
    // The re-read is scoped to the owner, not just the habit id.
    expect(prisma.habit.findFirst.mock.calls[1][0].where).toEqual({ id: "h1", userId: "u1" })
  })

  it("returns habit: null when the post-write re-read finds nothing", async () => {
    prisma.habit.findFirst.mockResolvedValueOnce(habitRow).mockResolvedValueOnce(null)
    prisma.habitCheckIn.findUnique.mockResolvedValue(null)

    const res = await checkInHabit("u1", "h1", {})

    expect(res).toEqual({ success: true, habit: null })
  })
})
