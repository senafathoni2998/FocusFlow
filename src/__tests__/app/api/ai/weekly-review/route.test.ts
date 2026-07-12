/**
 * Unit tests for src/app/api/ai/weekly-review/route.ts
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "content-type": "application/json" },
      }),
  },
}))

const mockChatCreate = jest.fn()
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: (...a: any[]) => mockChatCreate(...a) } },
  })),
}))

const mockTaskFindMany = jest.fn()
const mockTaskCount = jest.fn()
const mockSessionFindMany = jest.fn()
const mockHabitFindMany = jest.fn()
const mockGoalFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: (...a: any[]) => mockTaskFindMany(...a),
      count: (...a: any[]) => mockTaskCount(...a),
    },
    focusSession: { findMany: (...a: any[]) => mockSessionFindMany(...a) },
    habit: { findMany: (...a: any[]) => mockHabitFindMany(...a) },
    goal: { findMany: (...a: any[]) => mockGoalFindMany(...a) },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
  },
}))

const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({ auth: (...a: any[]) => mockAuth(...a) }))

import { GET } from "@/app/api/ai/weekly-review/route"

describe("Weekly review route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER"]) {
      delete process.env[k]
    }
    mockAuth.mockResolvedValue({ user: { id: "user-123" } })
    mockTaskCount.mockResolvedValue(1)
    // Map by the status filter (not call order) so the completed/pending datasets
    // can't be silently swapped by a query reorder.
    mockTaskFindMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.status === "completed"
          ? [{ title: "Ship it", priority: "high", completedAt: new Date() }]
          : [{ title: "Next thing", priority: "high" }],
      ),
    )
    mockSessionFindMany.mockResolvedValue([
      { startTime: new Date("2026-07-10T10:00:00Z"), endTime: new Date("2026-07-10T10:30:00Z") },
    ])
    mockHabitFindMany.mockResolvedValue([{ name: "Read", checkIns: [{ id: "c1" }] }])
    mockGoalFindMany.mockResolvedValue([{ title: "Launch" }])
    mockUserFindUnique.mockResolvedValue({ aiProvider: null })
  })
  afterEach(() => {
    delete process.env.GROQ_API_KEY
  })

  it("401s without a session", async () => {
    mockAuth.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("returns stats + AI recap/plan + the week window", async () => {
    process.env.GROQ_API_KEY = "test-key"
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "composeWeeklyReview",
              arguments: JSON.stringify({
                recap: ["You shipped it."],
                plan: ["Do the next thing."],
              }),
            },
          }],
        },
      }],
    })

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.stats).toEqual({ tasksCompleted: 1, focusMinutes: 30, habitCheckins: 1 })
    expect(data.recap).toEqual(["You shipped it."])
    expect(data.plan).toEqual(["Do the next thing."])
    expect(typeof data.weekStart).toBe("string")
    expect(typeof data.weekEnd).toBe("string")
  })

  it("returns a deterministic review when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY
    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.stats.tasksCompleted).toBe(1)
    expect(data.recap.length).toBeGreaterThan(0)
    expect(data.plan.length).toBeGreaterThan(0)
    expect(data.error).toBe("AI provider not configured")
    expect(mockChatCreate).not.toHaveBeenCalled()
  })

  it("derives tasksCompleted from count(), not the capped list", async () => {
    process.env.GROQ_API_KEY = "test-key"
    mockTaskCount.mockResolvedValue(73) // more than the take:50 recap list
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: "c", type: "function", function: {
            name: "composeWeeklyReview",
            arguments: JSON.stringify({ recap: ["r"], plan: ["p"] }),
          } }],
        },
      }],
    })
    const data = await (await GET()).json()
    expect(data.stats.tasksCompleted).toBe(73)
  })

  it("scopes every count to the rolling window (UTC-day bounds for habit check-ins)", async () => {
    // No provider needed — the queries run before the AI step.
    delete process.env.GROQ_API_KEY
    await GET()

    const countWhere = mockTaskCount.mock.calls[0][0].where
    expect(countWhere.status).toBe("completed")
    expect(countWhere.completedAt.gte).toBeInstanceOf(Date)
    expect(countWhere.completedAt.lte).toBeInstanceOf(Date)

    const sessionWhere = mockSessionFindMany.mock.calls[0][0].where
    expect(sessionWhere.startTime.gte).toBeInstanceOf(Date)

    // Habit check-ins must be filtered by UTC-midnight bounds, not local instants.
    const habitDate = mockHabitFindMany.mock.calls[0][0].select.checkIns.where.date
    expect(habitDate.gte).toBeInstanceOf(Date)
    expect(habitDate.gte.getUTCHours()).toBe(0)
  })

  it("falls back with NO error when the model returns empty tool args", async () => {
    process.env.GROQ_API_KEY = "test-key"
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: "c", type: "function", function: {
            name: "composeWeeklyReview",
            arguments: "{}",
          } }],
        },
      }],
    })
    const data = await (await GET()).json()
    expect(data.error).toBeUndefined()
    expect(data.recap.length).toBeGreaterThan(0)
    expect(data.plan.length).toBeGreaterThan(0)
  })

  it("falls back with an error string when the AI call throws", async () => {
    process.env.GROQ_API_KEY = "test-key"
    mockChatCreate.mockRejectedValue(new Error("boom"))
    const data = await (await GET()).json()
    expect(data.error).toBe("Failed to generate the review")
    expect(data.recap.length).toBeGreaterThan(0)
  })

  it("500s when a query throws", async () => {
    process.env.GROQ_API_KEY = "test-key"
    mockTaskFindMany.mockReset()
    mockTaskFindMany.mockRejectedValue(new Error("db down"))
    expect((await GET()).status).toBe(500)
  })
})
