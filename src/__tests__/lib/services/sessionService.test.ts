/**
 * sessionService: the mobile API's focus-session domain logic. Exercises the
 * taskId ownership check on start, the zod bounds on type/duration, the endTime
 * clamp on complete (see src/lib/sessionTiming.ts) and the ownership scoping of
 * complete/cancel/list — all against the global Prisma mock.
 */
jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}))

import {
  startSession,
  completeSession,
  cancelSession,
  getUserSessions,
} from "@/lib/services/sessionService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

// resetAllMocks (not clearAllMocks) also drains mockResolvedValueOnce queues so a
// value queued by one test can never leak into the next.
beforeEach(() => jest.resetAllMocks())

describe("sessionService.startSession", () => {
  it("creates a running session with the default type and no task", async () => {
    prisma.focusSession.create.mockResolvedValue({ id: "s1" })

    const session = await startSession("u1", { duration: 1500 })

    expect(session).toEqual({ id: "s1" })
    const data = prisma.focusSession.create.mock.calls[0][0].data
    expect(data.type).toBe("pomodoro") // schema default
    expect(data.duration).toBe(1500)
    expect(data.status).toBe("running")
    expect(data.userId).toBe("u1")
    expect(data.taskId).toBeNull()
    expect(data.startTime).toBeInstanceOf(Date)
    // startTime is stamped server-side, never taken from the client payload.
    expect(prisma.task.findFirst).not.toHaveBeenCalled()
  })

  it("attaches a taskId only after confirming the caller owns that task", async () => {
    prisma.task.findFirst.mockResolvedValue({ id: "t1" })
    prisma.focusSession.create.mockResolvedValue({ id: "s2", taskId: "t1" })

    await startSession("u1", { taskId: "t1", type: "long-break", duration: 900 })

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1" },
      select: { id: true },
    })
    const data = prisma.focusSession.create.mock.calls[0][0].data
    expect(data.taskId).toBe("t1")
    expect(data.type).toBe("long-break")
  })

  it("404s instead of attaching a session to another user's task (IDOR)", async () => {
    prisma.task.findFirst.mockResolvedValue(null) // the id exists, but not for this user

    await expect(startSession("u1", { taskId: "foreign-task", duration: 1500 })).rejects.toMatchObject({
      status: 404,
      message: "Task not found",
    })
    expect(prisma.focusSession.create).not.toHaveBeenCalled()
  })

  it("rejects an unknown session type", async () => {
    await expect(startSession("u1", { type: "coffee-break", duration: 1500 })).rejects.toBeDefined()
    expect(prisma.focusSession.create).not.toHaveBeenCalled()
  })

  it.each([
    ["zero", 0],
    ["negative", -60],
    ["fractional", 1500.5],
    ["longer than 24h", 24 * 60 * 60 + 1],
  ])("rejects a %s duration", async (_label, duration) => {
    await expect(startSession("u1", { duration })).rejects.toBeDefined()
    expect(prisma.focusSession.create).not.toHaveBeenCalled()
  })

  it("accepts a duration of exactly 24h (the inclusive upper bound)", async () => {
    prisma.focusSession.create.mockResolvedValue({ id: "s3" })
    await startSession("u1", { duration: 24 * 60 * 60 })
    expect(prisma.focusSession.create.mock.calls[0][0].data.duration).toBe(86400)
  })

  it("rejects a missing duration", async () => {
    await expect(startSession("u1", {})).rejects.toBeDefined()
    expect(prisma.focusSession.create).not.toHaveBeenCalled()
  })
})

describe("sessionService.completeSession", () => {
  it("404s for a session belonging to another user, without updating anything", async () => {
    prisma.focusSession.findFirst.mockResolvedValue(null)

    await expect(completeSession("u1", "s-foreign")).rejects.toMatchObject({
      status: 404,
      message: "Session not found",
    })
    // The lookup itself is what scopes the write — assert it is user-scoped.
    expect(prisma.focusSession.findFirst).toHaveBeenCalledWith({
      where: { id: "s-foreign", userId: "u1" },
    })
    expect(prisma.focusSession.update).not.toHaveBeenCalled()
  })

  it("clamps endTime to startTime + duration when a sleeping device finishes hours late", async () => {
    const startTime = new Date(Date.now() - 3 * 60 * 60 * 1000) // started 3h ago
    prisma.focusSession.findFirst.mockResolvedValue({ id: "s1", startTime, duration: 1500 })
    prisma.focusSession.update.mockResolvedValue({ id: "s1", status: "completed" })

    await completeSession("u1", "s1")

    const data = prisma.focusSession.update.mock.calls[0][0].data
    expect(data.status).toBe("completed")
    // Not the wall clock (3h) — exactly the planned 25 minutes.
    expect(data.endTime.getTime()).toBe(startTime.getTime() + 1500 * 1000)
    expect(data.endTime.getTime() - startTime.getTime()).toBe(25 * 60 * 1000)
  })

  it("keeps the real endTime when the session finishes early (no padding)", async () => {
    const startTime = new Date(Date.now() - 60 * 1000) // one minute into a 25-min timer
    prisma.focusSession.findFirst.mockResolvedValue({ id: "s1", startTime, duration: 1500 })
    prisma.focusSession.update.mockResolvedValue({ id: "s1" })

    await completeSession("u1", "s1")

    const endTime: Date = prisma.focusSession.update.mock.calls[0][0].data.endTime
    const elapsed = endTime.getTime() - startTime.getTime()
    expect(elapsed).toBeGreaterThanOrEqual(60 * 1000)
    expect(elapsed).toBeLessThan(90 * 1000) // nowhere near the 1500s cap
  })
})

describe("sessionService.cancelSession", () => {
  it("404s for a session belonging to another user", async () => {
    prisma.focusSession.findFirst.mockResolvedValue(null)

    await expect(cancelSession("u1", "s-foreign")).rejects.toMatchObject({
      status: 404,
      message: "Session not found",
    })
    expect(prisma.focusSession.update).not.toHaveBeenCalled()
  })

  it("marks the session cancelled, stamps endTime and returns a success flag", async () => {
    prisma.focusSession.findFirst.mockResolvedValue({ id: "s1", startTime: new Date(), duration: 1500 })
    prisma.focusSession.update.mockResolvedValue({ id: "s1" })

    const result = await cancelSession("u1", "s1")

    expect(result).toEqual({ success: true })
    const call = prisma.focusSession.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: "s1" })
    expect(call.data.status).toBe("cancelled")
    expect(call.data.endTime).toBeInstanceOf(Date)
  })
})

describe("sessionService.getUserSessions", () => {
  it("returns the caller's last 30 days, newest first, with the task title joined", async () => {
    prisma.focusSession.findMany.mockResolvedValue([{ id: "s1" }])

    const sessions = await getUserSessions("u1")

    expect(sessions).toEqual([{ id: "s1" }])
    const arg = prisma.focusSession.findMany.mock.calls[0][0]
    expect(arg.where.userId).toBe("u1")
    expect(arg.orderBy).toEqual({ startTime: "desc" })
    expect(arg.include).toEqual({ task: { select: { title: true } } })
    const windowDays = (Date.now() - arg.where.startTime.gte.getTime()) / 86_400_000
    expect(windowDays).toBeGreaterThan(29)
    expect(windowDays).toBeLessThan(31)
  })

  it("honours a custom day window", async () => {
    prisma.focusSession.findMany.mockResolvedValue([])

    await getUserSessions("u1", 7)

    const gte: Date = prisma.focusSession.findMany.mock.calls[0][0].where.startTime.gte
    const windowDays = (Date.now() - gte.getTime()) / 86_400_000
    expect(windowDays).toBeGreaterThan(6)
    expect(windowDays).toBeLessThan(8)
  })
})
