/**
 * goalService: the mobile API's goal domain logic. Exercises ownership scoping on
 * every by-id operation, the derived task counts + progress attached to reads, the
 * DELTA (not absolute-set) semantics of adjustGoalProgress across the three
 * progressType variants, and the status-transition allow-list.
 *
 * Prisma is the global mock from jest.setup.js, extended here with `goal` (the
 * shared mock only ships task/user/focusSession).
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

import {
  getGoals,
  getArchivedGoals,
  getGoalTasks,
  createGoal,
  updateGoal,
  adjustGoalProgress,
  setGoalStatus,
  deleteGoal,
} from "@/lib/services/goalService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

/** A persisted goal row as Prisma would hand it back (no derived fields). */
function goalRow(over: Record<string, unknown> = {}) {
  return {
    id: "g1",
    userId: "u1",
    title: "Read 12 books",
    description: null,
    icon: "🎯",
    color: "primary",
    progressType: "manual",
    targetValue: null,
    currentValue: 0,
    unit: null,
    manualProgress: 0,
    targetDate: null,
    status: "active",
    order: 10,
    ...over,
  }
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) also drains mockResolvedValueOnce queues.
  jest.resetAllMocks()
  prisma.goal = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
    aggregate: jest.fn().mockResolvedValue({ _max: { order: 40 } }),
  }
  prisma.task.findMany = jest.fn().mockResolvedValue([])
})

describe("goalService.getGoals", () => {
  it("scopes to the caller and excludes archived goals", async () => {
    await getGoals("u1")

    const where = prisma.goal.findMany.mock.calls[0][0].where
    expect(where.userId).toBe("u1")
    expect(where.status).toEqual({ not: "archived" })
  })

  it("derives task counts that skip wont-do and recurring tasks, and strips the raw tasks", async () => {
    prisma.goal.findMany.mockResolvedValue([
      goalRow({
        progressType: "tasks",
        tasks: [
          { status: "completed", recurrenceId: null },
          { status: "completed", recurrenceId: null },
          { status: "todo", recurrenceId: null },
          // abandoned -> out of the denominator entirely
          { status: "wont-do", recurrenceId: null },
          // recurring -> excluded, else the goal could never reach 100%
          { status: "completed", recurrenceId: "r1" },
        ],
      }),
    ])

    const [goal] = await getGoals("u1")

    expect(goal.taskTotal).toBe(3)
    expect(goal.taskCompleted).toBe(2)
    expect(goal).not.toHaveProperty("tasks")
    expect(goal.progress.percent).toBe(67) // 2/3 rounded
  })

  it("computes percent per progressType and flags an achieved goal", async () => {
    prisma.goal.findMany.mockResolvedValue([
      goalRow({ id: "manual", progressType: "manual", manualProgress: 40, tasks: [] }),
      goalRow({
        id: "numeric",
        progressType: "numeric",
        currentValue: 5,
        targetValue: 10,
        tasks: [],
      }),
      goalRow({ id: "done", progressType: "manual", manualProgress: 20, status: "achieved", tasks: [] }),
    ])

    const [manual, numeric, done] = await getGoals("u1")

    expect(manual.progress.percent).toBe(40)
    expect(numeric.progress.percent).toBe(50)
    // status "achieved" wins over a percent that hasn't reached 100.
    expect(done.progress.isAchieved).toBe(true)
    expect(manual.progress.isAchieved).toBe(false)
  })

  it("marks a past-deadline unachieved goal overdue", async () => {
    prisma.goal.findMany.mockResolvedValue([
      goalRow({ manualProgress: 10, targetDate: new Date("2020-01-01T00:00:00.000Z"), tasks: [] }),
    ])

    const [goal] = await getGoals("u1")

    expect(goal.progress.isOverdue).toBe(true)
    expect(goal.progress.daysRemaining).toBeLessThan(0)
  })
})

describe("goalService.getArchivedGoals", () => {
  it("returns only archived goals for the caller, newest-touched first", async () => {
    prisma.goal.findMany.mockResolvedValue([goalRow({ status: "archived", tasks: [] })])

    const goals = await getArchivedGoals("u1")

    const arg = prisma.goal.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ userId: "u1", status: "archived" })
    expect(arg.orderBy).toEqual([{ updatedAt: "desc" }])
    // Archived goals still carry the derived fields so the client renders them.
    expect(goals[0].progress).toBeDefined()
    expect(goals[0].taskTotal).toBe(0)
  })
})

describe("goalService.getGoalTasks", () => {
  it("scopes to the caller's own tasks so an unowned goalId simply yields none", async () => {
    prisma.task.findMany.mockResolvedValue([])

    const tasks = await getGoalTasks("u1", "someone-elses-goal")

    expect(tasks).toEqual([])
    expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      goalId: "someone-elses-goal",
      status: { not: "wont-do" },
      // Mirrors the progress denominator, so ticking every listed task reaches 100%.
      recurrenceId: null,
    })
  })
})

describe("goalService.createGoal", () => {
  it("applies defaults, spaces the order after the caller's last goal, and stamps the owner", async () => {
    prisma.goal.create.mockResolvedValue(goalRow())

    await createGoal("u1", { title: "Read 12 books" })

    const data = prisma.goal.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      title: "Read 12 books",
      icon: "🎯",
      color: "primary",
      progressType: "manual",
      currentValue: 0,
      manualProgress: 0,
      targetValue: null,
      targetDate: null,
      status: "active",
      userId: "u1",
    })
    expect(data.order).toBe(50) // max 40 + 10
    expect(prisma.goal.aggregate.mock.calls[0][0].where).toEqual({ userId: "u1" })
  })

  it("stores a yyyy-mm-dd deadline at UTC midnight so the countdown can't drift a day", async () => {
    prisma.goal.create.mockResolvedValue(goalRow())

    await createGoal("u1", { title: "Ship v2", targetDate: "2026-08-31" })

    const { targetDate } = prisma.goal.create.mock.calls[0][0].data
    expect((targetDate as Date).toISOString()).toBe("2026-08-31T00:00:00.000Z")
  })

  it("starts numbering at 10 for a user's very first goal", async () => {
    prisma.goal.aggregate.mockResolvedValue({ _max: { order: null } })
    prisma.goal.create.mockResolvedValue(goalRow())

    await createGoal("u1", { title: "First" })

    expect(prisma.goal.create.mock.calls[0][0].data.order).toBe(10)
  })

  it.each([
    ["an empty title", { title: "" }],
    ["an unknown progressType", { title: "x", progressType: "vibes" }],
    ["an unknown color", { title: "x", color: "chartreuse" }],
    ["manualProgress above 100", { title: "x", manualProgress: 101 }],
    ["a non-positive targetValue", { title: "x", targetValue: 0 }],
    ["a non-ISO targetDate", { title: "x", targetDate: "31/08/2026" }],
    ["an unknown status", { title: "x", status: "paused" }],
  ])("rejects %s", async (_label, input) => {
    await expect(createGoal("u1", input)).rejects.toBeDefined()
    expect(prisma.goal.create).not.toHaveBeenCalled()
  })
})

describe("goalService.updateGoal", () => {
  it("404s (and writes nothing) when the goal belongs to someone else", async () => {
    prisma.goal.findFirst.mockResolvedValue(null)

    await expect(updateGoal("u1", "g-foreign", { title: "Mine now" })).rejects.toMatchObject({
      status: 404,
      message: "Goal not found",
    })
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })

  it("looks the goal up by id AND userId before patching", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())
    prisma.goal.update.mockResolvedValue(goalRow({ title: "New" }))

    await updateGoal("u1", "g1", { title: "New" })

    expect(prisma.goal.findFirst.mock.calls[0][0].where).toEqual({ id: "g1", userId: "u1" })
  })

  it("patches only the fields that were actually provided", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())
    prisma.goal.update.mockResolvedValue(goalRow())

    await updateGoal("u1", "g1", { title: "Renamed", status: "achieved" })

    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({
      title: "Renamed",
      status: "achieved",
    })
  })

  it("clears the deadline when targetDate is sent as null", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())
    prisma.goal.update.mockResolvedValue(goalRow())

    await updateGoal("u1", "g1", { targetDate: null })

    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ targetDate: null })
  })

  it("rejects an invalid patch value after the ownership check", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())

    await expect(updateGoal("u1", "g1", { manualProgress: 500 })).rejects.toBeDefined()
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })
})

describe("goalService.adjustGoalProgress", () => {
  it("moves manual progress BY the delta rather than setting it to the delta", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow({ progressType: "manual", manualProgress: 40 }))
    prisma.goal.update.mockResolvedValue({})

    await adjustGoalProgress("u1", "g1", 15)

    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ manualProgress: 55 })
  })

  it("clamps manual progress to 0-100 and rounds fractional deltas", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow({ progressType: "manual", manualProgress: 95 }))
    prisma.goal.update.mockResolvedValue({})
    await adjustGoalProgress("u1", "g1", 20)
    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ manualProgress: 100 })

    prisma.goal.update.mockClear()
    prisma.goal.findFirst.mockResolvedValue(goalRow({ progressType: "manual", manualProgress: 5 }))
    await adjustGoalProgress("u1", "g1", -20)
    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ manualProgress: 0 })

    prisma.goal.update.mockClear()
    prisma.goal.findFirst.mockResolvedValue(goalRow({ progressType: "manual", manualProgress: 40 }))
    await adjustGoalProgress("u1", "g1", 0.6)
    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ manualProgress: 41 })
  })

  it("moves a numeric goal's currentValue by the delta, keeping fractions, clamped at 0", async () => {
    prisma.goal.findFirst.mockResolvedValue(
      goalRow({ progressType: "numeric", currentValue: 3, targetValue: 12 })
    )
    prisma.goal.update.mockResolvedValue({})
    await adjustGoalProgress("u1", "g1", 2.5)
    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ currentValue: 5.5 })

    prisma.goal.update.mockClear()
    await adjustGoalProgress("u1", "g1", -100)
    expect(prisma.goal.update.mock.calls[0][0].data).toEqual({ currentValue: 0 })
  })

  it("is a no-op for a tasks-derived goal (its progress comes from linked tasks)", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow({ progressType: "tasks" }))

    await expect(adjustGoalProgress("u1", "g1", 10)).resolves.toEqual({ success: true })
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })

  it("404s on a goal the caller doesn't own", async () => {
    prisma.goal.findFirst.mockResolvedValue(null)

    await expect(adjustGoalProgress("u1", "g-foreign", 10)).rejects.toMatchObject({ status: 404 })
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an absurdly large delta", 1_000_001],
  ])("400s on %s without even loading the goal", async (_label, delta) => {
    await expect(adjustGoalProgress("u1", "g1", delta)).rejects.toMatchObject({
      status: 400,
      message: "Invalid input",
    })
    expect(prisma.goal.findFirst).not.toHaveBeenCalled()
  })
})

describe("goalService.setGoalStatus", () => {
  it.each(["active", "achieved", "archived"])("allows the %s status", async (status) => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())
    prisma.goal.update.mockResolvedValue({})

    await expect(setGoalStatus("u1", "g1", status)).resolves.toEqual({ success: true })
    expect(prisma.goal.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status } })
  })

  it.each([
    ["an unknown status", "paused"],
    ["an empty status", ""],
    ["a case-mismatched status", "Archived"],
  ])("400s on %s before touching the database", async (_label, status) => {
    await expect(setGoalStatus("u1", "g1", status)).rejects.toMatchObject({
      status: 400,
      message: "Invalid status",
    })
    expect(prisma.goal.findFirst).not.toHaveBeenCalled()
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })

  it("404s on a goal the caller doesn't own", async () => {
    prisma.goal.findFirst.mockResolvedValue(null)

    await expect(setGoalStatus("u1", "g-foreign", "archived")).rejects.toMatchObject({ status: 404 })
    expect(prisma.goal.update).not.toHaveBeenCalled()
  })
})

describe("goalService.deleteGoal", () => {
  it("deletes a goal the caller owns", async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow())

    await expect(deleteGoal("u1", "g1")).resolves.toEqual({ success: true })
    expect(prisma.goal.findFirst.mock.calls[0][0].where).toEqual({ id: "g1", userId: "u1" })
    expect(prisma.goal.delete).toHaveBeenCalledWith({ where: { id: "g1" } })
  })

  it("404s (and deletes nothing) on a goal the caller doesn't own", async () => {
    prisma.goal.findFirst.mockResolvedValue(null)

    await expect(deleteGoal("u1", "g-foreign")).rejects.toMatchObject({ status: 404 })
    expect(prisma.goal.delete).not.toHaveBeenCalled()
  })
})
