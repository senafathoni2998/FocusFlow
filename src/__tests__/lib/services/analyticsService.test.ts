/**
 * @jest-environment node
 *
 * analyticsService.getDashboard: the one-round-trip home-screen summary. The
 * interesting behaviour is all boundary arithmetic (local-midnight day/week edges)
 * plus the fact that every count must be scoped to the caller's userId — so the
 * clock is frozen with fake timers and the Prisma queries are asserted by shape.
 */
import { getDashboard } from "@/lib/services/analyticsService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

// Frozen "now": Mon 3 Aug 2026, 14:30 local time. Constructed with the local-time
// Date ctor so the assertions hold in any TZ the suite happens to run under.
const NOW = new Date(2026, 7, 3, 14, 30, 0)
const TODAY_START = new Date(2026, 7, 3)
const TOMORROW_START = new Date(2026, 7, 4)
const WEEK_AGO = new Date(2026, 6, 27)

type TaskRow = { status: string; dueDate: Date | null; completedAt: Date | null }
type SessionRow = { startTime: Date; endTime: Date | null }

function arrange(tasks: TaskRow[] = [], sessions: SessionRow[] = []) {
  prisma.task.findMany.mockResolvedValue(tasks)
  prisma.focusSession.findMany.mockResolvedValue(sessions)
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers({ now: NOW })
  prisma.goal = { count: jest.fn().mockResolvedValue(0) }
  prisma.habit = { count: jest.fn().mockResolvedValue(0) }
  arrange()
})

afterEach(() => {
  jest.useRealTimers()
})

describe("analyticsService.getDashboard — user scoping", () => {
  it("scopes every query to the caller and counts only top-level tasks", async () => {
    await getDashboard("u1")

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", parentTaskId: null } })
    )
    expect(prisma.focusSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) })
    )
    expect(prisma.goal.count).toHaveBeenCalledWith({ where: { userId: "u1", status: "active" } })
    expect(prisma.habit.count).toHaveBeenCalledWith({ where: { userId: "u1", archived: false } })
  })

  it("passes through the active-goal and non-archived-habit counts", async () => {
    prisma.goal.count.mockResolvedValue(3)
    prisma.habit.count.mockResolvedValue(7)

    const summary = await getDashboard("u1")

    expect(summary.activeGoals).toBe(3)
    expect(summary.habitCount).toBe(7)
  })
})

describe("analyticsService.getDashboard — byStatus breakdown", () => {
  it("tallies each status and always reports the four known buckets, zero-filled", async () => {
    arrange([
      { status: "todo", dueDate: null, completedAt: null },
      { status: "todo", dueDate: null, completedAt: null },
      { status: "in-progress", dueDate: null, completedAt: null },
      { status: "wont-do", dueDate: null, completedAt: null },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.total).toBe(4)
    expect(tasks.byStatus).toEqual({ todo: 2, "in-progress": 1, completed: 0, "wont-do": 1 })
  })

  it("returns all-zero buckets (not an empty object) when the user has no tasks", async () => {
    const { tasks } = await getDashboard("u1")

    expect(tasks.total).toBe(0)
    expect(tasks.byStatus).toEqual({ todo: 0, "in-progress": 0, completed: 0, "wont-do": 0 })
    expect(tasks).toMatchObject({ overdue: 0, dueToday: 0, completedToday: 0, completedThisWeek: 0 })
  })
})

describe("analyticsService.getDashboard — overdue / dueToday boundaries", () => {
  it("counts only OPEN tasks due strictly before local midnight as overdue", async () => {
    arrange([
      { status: "todo", dueDate: new Date(2026, 7, 2, 23, 59, 59), completedAt: null },
      { status: "in-progress", dueDate: new Date(2026, 6, 1), completedAt: null },
      // Closed tasks are never overdue, however stale their due date.
      { status: "completed", dueDate: new Date(2026, 6, 1), completedAt: null },
      { status: "wont-do", dueDate: new Date(2026, 6, 1), completedAt: null },
      // Exactly at today's start is due-today, not overdue.
      { status: "todo", dueDate: TODAY_START, completedAt: null },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.overdue).toBe(2)
    expect(tasks.dueToday).toBe(1)
  })

  it("treats dueToday as [todayStart, tomorrowStart) and ignores tasks with no due date", async () => {
    arrange([
      { status: "todo", dueDate: TODAY_START, completedAt: null },
      { status: "in-progress", dueDate: new Date(2026, 7, 3, 23, 59, 59), completedAt: null },
      // Midnight tomorrow falls outside the half-open window.
      { status: "todo", dueDate: TOMORROW_START, completedAt: null },
      { status: "todo", dueDate: null, completedAt: null },
      // Completed tasks due today are excluded — dueToday is a "still to do" number.
      { status: "completed", dueDate: TODAY_START, completedAt: null },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.dueToday).toBe(2)
    expect(tasks.overdue).toBe(0)
  })
})

describe("analyticsService.getDashboard — completion windows", () => {
  it("counts completedToday within today's local day only", async () => {
    arrange([
      { status: "completed", dueDate: null, completedAt: TODAY_START },
      { status: "completed", dueDate: null, completedAt: new Date(2026, 7, 3, 23, 59, 59) },
      { status: "completed", dueDate: null, completedAt: new Date(2026, 7, 2, 23, 59, 59) },
      { status: "completed", dueDate: null, completedAt: TOMORROW_START },
      { status: "todo", dueDate: null, completedAt: null },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.completedToday).toBe(2)
  })

  /**
   * Pins CURRENT behaviour, which looks wrong: the tallies key off `completedAt`
   * alone, and taskService stamps completedAt for BOTH terminal statuses
   * (`completed` and `wont-do`). So abandoning a task increments the "completed"
   * numbers. Reported as a suspected defect rather than fixed here.
   */
  it("currently counts abandoned 'wont-do' tasks as completions because they carry a completedAt", async () => {
    arrange([
      { status: "wont-do", dueDate: null, completedAt: new Date(2026, 7, 3, 10, 0) },
      { status: "completed", dueDate: null, completedAt: new Date(2026, 7, 3, 10, 0) },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.completedToday).toBe(2)
    expect(tasks.completedThisWeek).toBe(2)
    // ...even though the status breakdown correctly reports only one completion.
    expect(tasks.byStatus.completed).toBe(1)
  })

  it("includes the weekAgo boundary in completedThisWeek and excludes the instant before it", async () => {
    arrange([
      { status: "completed", dueDate: null, completedAt: WEEK_AGO }, // inclusive lower bound
      { status: "completed", dueDate: null, completedAt: new Date(2026, 6, 26, 23, 59, 59) },
      { status: "completed", dueDate: null, completedAt: new Date(2026, 7, 1, 12, 0) },
      { status: "completed", dueDate: null, completedAt: new Date(2026, 7, 3, 9, 0) },
    ])

    const { tasks } = await getDashboard("u1")

    expect(tasks.completedThisWeek).toBe(3)
    // Today's completions are a subset of the week's, never counted separately.
    expect(tasks.completedToday).toBe(1)
  })

  // completedThisWeek has no upper bound (`c >= weekAgo`), so a completedAt in the
  // future — clock skew between the app server and Postgres, or an imported task —
  // still counts. Pinned as current behaviour; flagged as a suspected defect.
  it("currently counts a future completedAt toward completedThisWeek", async () => {
    arrange([{ status: "completed", dueDate: null, completedAt: new Date(2027, 0, 1) }])

    const { tasks } = await getDashboard("u1")

    expect(tasks.completedThisWeek).toBe(1)
    expect(tasks.completedToday).toBe(0)
  })
})

describe("analyticsService.getDashboard — focus minutes", () => {
  it("asks the DB for completed POMODORO sessions only, so breaks never inflate focus time", async () => {
    await getDashboard("u1")

    expect(prisma.focusSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u1",
          status: "completed",
          type: "pomodoro",
          startTime: { gte: WEEK_AGO },
        },
      })
    )
  })

  it("sums whole minutes, flooring partial ones", async () => {
    arrange(
      [],
      [
        { startTime: new Date(2026, 7, 3, 9, 0, 0), endTime: new Date(2026, 7, 3, 9, 25, 0) },
        // 24m59s floors to 24, not 25.
        { startTime: new Date(2026, 7, 2, 9, 0, 0), endTime: new Date(2026, 7, 2, 9, 24, 59) },
      ]
    )

    const summary = await getDashboard("u1")

    expect(summary.focusMinutesThisWeek).toBe(49)
  })

  it("skips still-running sessions and non-positive durations", async () => {
    arrange(
      [],
      [
        { startTime: new Date(2026, 7, 3, 9, 0, 0), endTime: null }, // never finished
        { startTime: new Date(2026, 7, 3, 10, 0, 0), endTime: new Date(2026, 7, 3, 10, 0, 30) }, // <1 min
        { startTime: new Date(2026, 7, 3, 11, 0, 0), endTime: new Date(2026, 7, 3, 10, 0, 0) }, // clock skew
        { startTime: new Date(2026, 7, 3, 12, 0, 0), endTime: new Date(2026, 7, 3, 12, 50, 0) },
      ]
    )

    const summary = await getDashboard("u1")

    expect(summary.focusMinutesThisWeek).toBe(50)
  })

  it("reports zero focus minutes when the week has no sessions", async () => {
    const summary = await getDashboard("u1")

    expect(summary.focusMinutesThisWeek).toBe(0)
  })
})
