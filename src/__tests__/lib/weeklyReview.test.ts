import { generateWeeklyReview } from "@/lib/weeklyReview"

// With no provider configured, generateWeeklyReview must still return computed
// stats and a deterministic recap/plan (the card works with no AI key).
describe("generateWeeklyReview — deterministic fallback", () => {
  beforeEach(() => {
    for (const k of [
      "GROQ_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DEEPSEEK_API_KEY",
      "GEMINI_API_KEY",
      "AI_PROVIDER",
    ]) {
      delete process.env[k]
    }
  })

  const data = {
    completedTasks: [
      { title: "Ship login", priority: "high" },
      { title: "Fix bug", priority: "medium" },
      { title: "Write docs", priority: "low" },
    ],
    pendingTasks: [
      { title: "Design API", priority: "high" },
      { title: "Email team", priority: "low" },
    ],
    sessions: [
      { startTime: new Date("2026-07-10T10:00:00Z"), endTime: new Date("2026-07-10T10:50:00Z") },
      { startTime: new Date("2026-07-11T09:00:00Z"), endTime: new Date("2026-07-11T09:25:00Z") },
    ],
    habits: [
      { name: "Read", checkIns: [{}, {}] },
      { name: "Run", checkIns: [{}] },
    ],
    goals: [{ title: "Launch v2" }],
  }

  it("computes stats and a deterministic recap + plan", async () => {
    const r = await generateWeeklyReview(data as any, null)
    expect(r.stats).toEqual({ tasksCompleted: 3, focusMinutes: 75, habitCheckins: 3 })
    expect(r.error).toBe("AI provider not configured")

    const recap = r.recap.join(" ")
    expect(recap).toMatch(/Completed 3 tasks/)
    expect(recap).toMatch(/Ship login/)
    expect(recap).toMatch(/1h 15m/) // 75 minutes
    expect(recap).toMatch(/3 times/) // habit check-ins

    const plan = r.plan.join(" ")
    expect(plan).toMatch(/Design API/) // top pending (high priority)
    expect(plan).toMatch(/Launch v2/) // goal nudge
  })

  it("handles an empty week without crashing", async () => {
    const empty = { completedTasks: [], pendingTasks: [], sessions: [], habits: [], goals: [] }
    const r = await generateWeeklyReview(empty as any, null)
    expect(r.stats).toEqual({ tasksCompleted: 0, focusMinutes: 0, habitCheckins: 0 })
    expect(r.recap.length).toBeGreaterThan(0)
    expect(r.plan.length).toBeGreaterThan(0)
  })

  it("ignores negative/zero-length sessions in focus minutes", async () => {
    const d = {
      ...data,
      sessions: [
        { startTime: new Date("2026-07-10T10:00:00Z"), endTime: new Date("2026-07-10T09:00:00Z") }, // ends before start
        { startTime: new Date("2026-07-10T10:00:00Z"), endTime: null }, // unfinished
      ],
    }
    const r = await generateWeeklyReview(d as any, null)
    expect(r.stats.focusMinutes).toBe(0)
  })
})
