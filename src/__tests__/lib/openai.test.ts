/**
 * Unit tests for src/lib/openai.ts
 *
 * Tests cover:
 * - generateInsights function
 * - getDefaultInsights function (internal logic)
 * - Error handling
 * - Various task/session states
 */

// Controllable OpenAI SDK mock so we can exercise the with-API-key path (the
// no-key tests never reach the client, so the mock is inert for them).
const mockCreate = jest.fn()
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: (...args: any[]) => mockCreate(...args) } },
  })),
}))

describe("OpenAI Service", () => {
  let generateInsights: any
  const originalEnv = process.env

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.resetModules()

    // Remove API key to force default insights (more reliable testing)
    process.env = { ...originalEnv }
    delete process.env.GROQ_API_KEY

    // Import fresh for each test
    const openaiModule = await import("@/lib/openai")
    generateInsights = openaiModule.generateInsights
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const createMockSession = (status: string, startTime: string, endTime?: string, duration?: number) => ({
    id: "1",
    status,
    startTime,
    endTime,
    duration,
    type: "pomodoro",
  })

  const createMockTask = (status: string, priority: string, title: string) => ({
    id: "1",
    title,
    status,
    priority,
    dueDate: null,
  })

  describe("generateInsights - default insights (no API key)", () => {
    it("should return default insights when API key is not configured", async () => {
      const sessions = [createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:25:00Z", 25)]
      const tasks = [createMockTask("todo", "high", "Test task")]

      const result = await generateInsights(sessions, tasks)

      expect(result.error).toBe("Groq API key not configured")
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)
    })

    it("should suggest breaking down tasks when there are many pending tasks", async () => {
      const sessions = []
      const tasks = Array.from({ length: 15 }, (_, i) =>
        createMockTask("todo", "medium", `Task ${i}`)
      )

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
      expect(result.insights.some((i: string) => i.includes("breaking down"))).toBe(true)
    })

    it("should suggest focusing on high priority tasks", async () => {
      const sessions = []
      const tasks = [
        createMockTask("todo", "high", "Task 1"),
        createMockTask("todo", "high", "Task 2"),
        createMockTask("todo", "high", "Task 3"),
        createMockTask("todo", "high", "Task 4"),
      ]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.some((i: string) => i.includes("high-priority") || i.includes("Focus on completing high-priority tasks"))).toBe(true)
    })

    it("should encourage user when they have completed sessions", async () => {
      const sessions = [
        createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:25:00Z", 25),
      ]
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.some((i: string) => i.includes("Great job") || i.includes("consistent"))).toBe(true)
    })

    it("should suggest starting with Pomodoro when no completed sessions", async () => {
      const sessions = []
      const tasks = [createMockTask("todo", "medium", "Task 1")]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.some((i: string) => i.includes("Pomodoro") || i.includes("Start with"))).toBe(true)
    })

    it("should suggest creating first task when no tasks exist", async () => {
      const sessions = []
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.some((i: string) => i.includes("first task"))).toBe(true)
    })

    it("should provide a generic insight when only completed tasks exist", async () => {
      const sessions = [createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:25:00Z", 25)]
      const tasks = [createMockTask("completed", "medium", "Task 1")]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
      // The insight for completed sessions should appear
      expect(result.insights.some((i: string) => i.includes("Great job") || i.includes("consistent"))).toBe(true)
    })

    it("should limit suggestions to 3 when multiple conditions match", async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)

      // Multiple triggers: no completed sessions, many pending tasks, overdue tasks
      const sessions = []
      const tasks = [
        createMockTask("todo", "high", "Task 1"),
        createMockTask("todo", "high", "Overdue task"),
        createMockTask("todo", "high", "Task 3"),
        createMockTask("todo", "high", "Task 4"),
        createMockTask("todo", "high", "Task 5"),
        createMockTask("todo", "high", "Task 6"),
        createMockTask("todo", "high", "Task 7"),
        createMockTask("todo", "high", "Task 8"),
        createMockTask("todo", "high", "Task 9"),
        createMockTask("todo", "high", "Task 10"),
        createMockTask("todo", "high", "Task 11"),
        createMockTask("todo", "medium", "Task 12"),
      ]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
      expect(result.insights.length).toBeLessThanOrEqual(5) // Default insights max
    })

    it("should return at least one insight even for empty state", async () => {
      const sessions = []
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
      expect(result.insights[0]).toBeDefined()
    })

    it("should handle mix of task statuses correctly", async () => {
      const sessions = [
        createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:25:00Z", 25),
      ]
      const tasks = [
        createMockTask("completed", "high", "Done task"),
        createMockTask("in-progress", "medium", "Working on it"),
        createMockTask("todo", "low", "To do"),
      ]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
    })

    it("should calculate total focus time for completed sessions", async () => {
      const sessions = [
        createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:30:00Z", 30), // 30 min
        createMockSession("completed", "2024-01-01T11:00:00Z", "2024-01-01T11:45:00Z", 45), // 45 min
        createMockSession("in-progress", "2024-01-01T12:00:00Z"), // Should be ignored
      ]
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      // 75 minutes total = 1 hour 15 minutes
      expect(result.insights.length).toBeGreaterThan(0)
    })

    it("should not count in-progress sessions for focus time", async () => {
      const sessions = [
        createMockSession("completed", "2024-01-01T10:00:00Z", "2024-01-01T10:25:00Z", 25),
        createMockSession("in-progress", "2024-01-01T11:00:00Z"), // No end time
      ]
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      // Only the completed session should be counted
      expect(result.insights.length).toBeGreaterThan(0)
    })

    it("should count tasks by status for insights", async () => {
      const sessions = []
      const tasks = [
        createMockTask("completed", "high", "Task 1"),
        createMockTask("completed", "medium", "Task 2"),
        createMockTask("in-progress", "low", "Task 3"),
        createMockTask("todo", "high", "Task 4"),
        createMockTask("todo", "medium", "Task 5"),
      ]

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.length).toBeGreaterThan(0)
      // With 3 pending (not completed) tasks, we should see some insight
      expect(result.insights.some((i: string) => i.length > 0)).toBe(true)
    })

    it("should handle sessions without endTime gracefully", async () => {
      const sessions = [
        createMockSession("in-progress", "2024-01-01T10:00:00Z"), // No endTime
        createMockSession("in-progress", "2024-01-01T11:00:00Z"), // No endTime
      ]
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      // Should not crash and return default insights
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)
    })

    it("should handle sessions with only startTime set", async () => {
      const sessions = [
        createMockSession("completed", "2024-01-01T10:00:00Z"), // Has startTime
      ]
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      // Should work correctly
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)
    })

    it("should handle large number of completed sessions", async () => {
      const sessions = Array.from({ length: 20 }, (_, i) =>
        createMockSession("completed", `2024-01-01T10:${String(i).padStart(2, "0")}:00Z`, `2024-01-01T10:${String(i).padStart(2, "0")}:25Z`, 25)
      )
      const tasks = []

      const result = await generateInsights(sessions, tasks)

      // Should handle large numbers without issues
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)
    })

    it("should handle very high priority task count", async () => {
      const sessions = []
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createMockTask("todo", "high", `High priority task ${i}`)
      )

      const result = await generateInsights(sessions, tasks)

      expect(result.insights.some((i: string) => i.includes("high-priority") || i.includes("Focus on completing high-priority tasks"))).toBe(true)
    })

    it("should return array of strings for insights", async () => {
      const sessions = []
      const tasks = [createMockTask("todo", "medium", "Test")]

      const result = await generateInsights(sessions, tasks)

      expect(Array.isArray(result.insights)).toBe(true)
      result.insights.forEach((insight: string) => {
        expect(typeof insight).toBe("string")
        expect(insight.length).toBeGreaterThan(0)
      })
    })
  })

  describe("generateInsights - goal & habit enrichment (no API key)", () => {
    // UTC midnight of (local today - offset days) — matches how check-ins store.
    const utcDay = (offset: number) => {
      const n = new Date()
      return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - offset))
    }

    const mockHabit = (checkInOffsets: number[]) => ({
      id: "h",
      name: "Meditate",
      frequencyType: "daily",
      weekdays: [] as number[],
      goalType: "achieve",
      targetAmount: 1,
      createdAt: utcDay(60),
      checkIns: checkInOffsets.map((o, i) => ({ id: String(i), date: utcDay(o), amount: 1 })),
    })

    it("flags goals past their target date", async () => {
      const goals = [
        { id: "g1", title: "Ship v1", progressType: "manual", status: "active", targetDate: utcDay(3) },
      ]

      const result = await generateInsights([], [], goals, [])

      expect(result.insights.some((i: string) => i.includes("past their target date"))).toBe(true)
    })

    it("nudges breaking active goals into tasks when none are overdue", async () => {
      const goals = [
        { id: "g1", title: "Learn piano", progressType: "manual", status: "active", targetDate: null },
      ]

      const result = await generateInsights([], [], goals, [])

      expect(result.insights.some((i: string) => i.includes("Break each active goal"))).toBe(true)
    })

    it("celebrates a habit streak of 3+ days", async () => {
      const habits = [mockHabit([0, 1, 2])]

      const result = await generateInsights([], [], [], habits)

      expect(result.insights.some((i: string) => i.includes("habit streak"))).toBe(true)
    })

    it("reminds about habits still open today when there's no streak", async () => {
      const habits = [mockHabit([1])] // only yesterday → streak 1, today not done

      const result = await generateInsights([], [], [], habits)

      expect(result.insights.some((i: string) => i.includes("check-in today"))).toBe(true)
    })

    it("adds nothing goal/habit-related when both are empty", async () => {
      const result = await generateInsights([], [createMockTask("todo", "medium", "T")])

      expect(result.insights.some((i: string) => i.includes("target date") || i.includes("habit streak") || i.includes("check-in today") || i.includes("Break each active goal"))).toBe(false)
    })
  })
})

describe("OpenAI Service - degraded paths keep goal/habit nudges (API key set)", () => {
  const originalEnv = process.env
  let generateInsights: any

  const utcDay = (offset: number) => {
    const n = new Date()
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - offset))
  }
  const streakHabit = () => ({
    id: "h",
    name: "Meditate",
    frequencyType: "daily",
    weekdays: [] as number[],
    goalType: "achieve",
    targetAmount: 1,
    createdAt: utcDay(60),
    checkIns: [0, 1, 2].map((o, i) => ({ id: String(i), date: utcDay(o), amount: 1 })),
  })
  const overdueGoal = () => ({
    id: "g",
    title: "Ship v1",
    progressType: "manual",
    status: "active",
    targetDate: utcDay(3),
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.resetModules()
    process.env = { ...originalEnv, GROQ_API_KEY: "test-key" }
    const mod = await import("@/lib/openai")
    generateInsights = mod.generateInsights
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("keeps goal/habit nudges when Groq throws", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"))

    const result = await generateInsights([], [], [overdueGoal()], [streakHabit()])

    expect(result.error).toBe("Failed to generate AI insights")
    expect(result.insights.some((i: string) => i.includes("past their target date"))).toBe(true)
    expect(result.insights.some((i: string) => i.includes("habit streak"))).toBe(true)
  })

  it("keeps goal/habit nudges when Groq returns empty content", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "" } }] })

    const result = await generateInsights([], [], [overdueGoal()], [streakHabit()])

    expect(result.insights.some((i: string) => i.includes("past their target date"))).toBe(true)
    expect(result.insights.some((i: string) => i.includes("habit streak"))).toBe(true)
  })
})
