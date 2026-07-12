import { getAIClient } from "@/lib/aiProviders"
import OpenAI from "openai"

/**
 * Weekly review generator. Given the user's completed work over a rolling 7-day
 * window plus their open work, it returns deterministic week STATS, an AI-written
 * completed-work RECAP, and a next-week PLAN. Falls back to a fully deterministic
 * recap/plan when no AI provider is configured or the call fails — the stats are
 * always computed locally, so the card is useful even with no AI key.
 */

export interface WeeklyReviewStats {
  tasksCompleted: number
  focusMinutes: number
  habitCheckins: number
}

export interface WeeklyReviewResult {
  stats: WeeklyReviewStats
  recap: string[]
  plan: string[]
  error?: string
}

export interface WeeklyReviewData {
  completedTasks: { title: string; priority?: string | null }[]
  /** True total of completed tasks in the window (completedTasks is a capped
   *  sample for the recap); falls back to the sample length if omitted. */
  completedCount?: number
  pendingTasks: { title: string; priority?: string | null }[]
  sessions: { startTime: Date | string; endTime: Date | string | null }[]
  habits: { name: string; checkIns: unknown[] }[]
  goals: { title: string }[]
}

function computeStats(data: WeeklyReviewData): WeeklyReviewStats {
  const focusMinutes = data.sessions.reduce((acc, s) => {
    if (!s.endTime) return acc
    const ms = new Date(s.endTime).getTime() - new Date(s.startTime).getTime()
    return ms > 0 ? acc + Math.floor(ms / 60000) : acc
  }, 0)
  const habitCheckins = data.habits.reduce((acc, h) => acc + (h.checkIns?.length ?? 0), 0)
  return {
    tasksCompleted: data.completedCount ?? data.completedTasks.length,
    focusMinutes,
    habitCheckins,
  }
}

function humanFocus(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "composeWeeklyReview",
    description: "Write the user's weekly review: a recap of what they completed and a plan for next week.",
    parameters: {
      type: "object",
      properties: {
        recap: {
          type: "array",
          items: { type: "string" },
          description:
            "2-5 short, encouraging bullets summarizing what the user actually completed this week (reference their real completed items). One sentence each.",
        },
        plan: {
          type: "array",
          items: { type: "string" },
          description:
            "2-5 short, concrete bullets for what to focus on next week, drawn from their pending high-priority tasks, active goals, and habits. One sentence each.",
        },
      },
      required: ["recap", "plan"],
    },
  },
}

const clean = (arr: unknown): string[] =>
  Array.isArray(arr)
    ? arr
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5)
    : []

export async function generateWeeklyReview(
  data: WeeklyReviewData,
  providerPref?: string | null,
): Promise<WeeklyReviewResult> {
  const stats = computeStats(data)
  const ai = getAIClient(providerPref)
  if (!ai) {
    return { stats, ...getDefaultWeeklyReview(stats, data), error: "AI provider not configured" }
  }

  try {
    const systemPrompt = `You are a supportive productivity coach writing a user's WEEKLY REVIEW covering the past 7 days. Call composeWeeklyReview with a recap of what they completed (celebrate real progress, reference actual items) and a concrete plan for next week (draw from their pending high-priority tasks, active goals, and habits). Be specific and encouraging; keep every bullet to one sentence.`

    const userPrompt = `This week's numbers:
- Tasks completed: ${stats.tasksCompleted}
- Focus time: ${humanFocus(stats.focusMinutes)}
- Habit check-ins: ${stats.habitCheckins}

Completed this week: ${JSON.stringify(data.completedTasks.slice(0, 12).map((t) => t.title))}
Open, most-urgent-first: ${JSON.stringify(
      data.pendingTasks.slice(0, 8).map((t) => ({ title: t.title, priority: t.priority })),
    )}
Habits (check-ins this week): ${JSON.stringify(
      data.habits.slice(0, 8).map((h) => ({ name: h.name, checkIns: h.checkIns?.length ?? 0 })),
    )}
Active goals: ${JSON.stringify(data.goals.slice(0, 8).map((g) => g.title))}`

    const response = await ai.client.chat.completions.create({
      model: ai.chatModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "composeWeeklyReview" } },
      temperature: 0.6,
      max_tokens: 700,
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    let args: Record<string, unknown> = {}
    if (toolCall) {
      try {
        args = JSON.parse(toolCall.function.arguments || "{}")
      } catch {
        args = {}
      }
    }
    const recap = clean(args.recap)
    const plan = clean(args.plan)

    // If the model returned nothing usable, fall back so the card is never empty.
    const fallback = getDefaultWeeklyReview(stats, data)
    return {
      stats,
      recap: recap.length ? recap : fallback.recap,
      plan: plan.length ? plan : fallback.plan,
    }
  } catch (error) {
    console.error("Weekly review AI error:", error)
    return { stats, ...getDefaultWeeklyReview(stats, data), error: "Failed to generate the review" }
  }
}

export function getDefaultWeeklyReview(
  stats: WeeklyReviewStats,
  data: WeeklyReviewData,
): { recap: string[]; plan: string[] } {
  const recap: string[] = []
  if (stats.tasksCompleted > 0) {
    const titles = data.completedTasks
      .slice(0, 3)
      .map((t) => `"${t.title}"`)
      .join(", ")
    recap.push(
      `✅ Completed ${stats.tasksCompleted} task${stats.tasksCompleted > 1 ? "s" : ""} this week${
        titles ? `, including ${titles}` : ""
      }.`,
    )
  }
  if (stats.focusMinutes > 0) {
    recap.push(`⏱ Logged ${humanFocus(stats.focusMinutes)} of focus time.`)
  }
  if (stats.habitCheckins > 0) {
    recap.push(
      `🔁 Checked in on your habits ${stats.habitCheckins} time${stats.habitCheckins > 1 ? "s" : ""}.`,
    )
  }
  if (recap.length === 0) {
    recap.push("🌱 A quiet week — nothing completed was logged. Next week is a fresh start.")
  }

  const plan: string[] = []
  for (const t of data.pendingTasks.slice(0, 3)) {
    plan.push(
      t.priority === "high"
        ? `🎯 Prioritize "${t.title}" (high priority).`
        : `📌 Make progress on "${t.title}".`,
    )
  }
  if (data.goals.length > 0) {
    plan.push(`📈 Advance your goal "${data.goals[0].title}" with a concrete next step.`)
  }
  if (plan.length === 0) {
    plan.push("🚀 Line up one meaningful task to start next week with momentum.")
  }

  return { recap, plan: plan.slice(0, 5) }
}
