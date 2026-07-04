import OpenAI from 'openai'
import { computeHabitStats } from '@/lib/habitStats'
import type { Habit } from '@/types/habit'

// Using Groq for fast, free AI inference
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "",
  baseURL: "https://api.groq.com/openai/v1"
})

/**
 * Count goals whose calendar-day deadline has passed and aren't achieved yet.
 * targetDate is stored at UTC midnight of the deadline day, so we compare CALENDAR
 * DAYS (target's UTC day vs now's LOCAL day) rather than instants — the same
 * timezone-safe convention goalStats.daysUntil uses. An instant compare would flag
 * a goal overdue up to a day early for non-UTC users.
 */
function overdueGoalCount(userGoals: any[]): number {
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return userGoals.filter((g) => {
    if (!g.targetDate || g.status === "achieved") return false
    const t = new Date(g.targetDate)
    const target = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
    return target < today
  }).length
}

export async function generateInsights(
  userSessions: any[],
  userTasks: any[],
  userGoals: any[] = [],
  userHabits: any[] = [],
) {
  if (!process.env.GROQ_API_KEY) {
    return {
      error: "Groq API key not configured",
      insights: getDefaultInsights(userSessions, userTasks, userGoals, userHabits)
    }
  }

  try {
    const completedSessions = userSessions.filter((s) => s.status === "completed")
    const totalFocusTime = completedSessions.reduce((acc, s) => {
      if (s.endTime) {
        return acc + Math.floor((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000 / 60)
      }
      return acc
    }, 0)

    const activeGoals = userGoals.filter((g) => g.status === "active")

    const systemPrompt = `You are a productivity coach. Analyze the user's work patterns across their tasks, goals, and habits, and provide 3-5 specific, actionable recommendations to improve productivity. Keep each recommendation concise (1-2 sentences) and practical.`

    const userPrompt = `Based on the following data:
- Total focus sessions: ${userSessions.length}
- Completed sessions: ${completedSessions.length}
- Total focus time: ${Math.floor(totalFocusTime / 60)} hours ${totalFocusTime % 60} minutes
- Total tasks: ${userTasks.length}
- Completed tasks: ${userTasks.filter((t) => t.status === "completed").length}
- Tasks in progress: ${userTasks.filter((t) => t.status === "in-progress").length}
- Tasks pending: ${userTasks.filter((t) => t.status === "todo").length}
- Active goals: ${activeGoals.length} (overdue: ${overdueGoalCount(userGoals)})
- Habits tracked: ${userHabits.length}

Recent sessions: ${JSON.stringify(completedSessions.slice(0, 5).map(s => ({
  type: s.type,
  duration: s.duration,
  date: s.startTime
})))}

Pending tasks: ${JSON.stringify(userTasks.filter((t) => t.status !== "completed").slice(0, 5).map(t => ({
  title: t.title,
  priority: t.priority,
  status: t.status
})))}

Active goals: ${JSON.stringify(activeGoals.slice(0, 5).map(g => ({
  title: g.title,
  progressType: g.progressType,
  status: g.status
})))}

Habits: ${JSON.stringify(userHabits.slice(0, 5).map(h => {
  const s = computeHabitStats(h as Habit)
  return { name: h.name, streak: s.currentStreak, doneToday: s.todayDone }
}))}

Provide 3-5 specific, actionable recommendations to improve productivity.`

    // Using Llama 3.1 8B on Groq - extremely fast and free
    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    })

    const insights = response.choices[0]?.message?.content || ""

    // Parse insights into bullet points
    const bulletPoints = insights
      .split(/\n\d+\.|\n-|\n\*/)
      .filter((s) => s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 5)

    return {
      insights: bulletPoints.length > 0
        ? bulletPoints
        : getDefaultInsights(userSessions, userTasks, userGoals, userHabits)
    }
  } catch (error) {
    console.error("Groq API error:", error)
    return {
      error: "Failed to generate AI insights",
      insights: getDefaultInsights(userSessions, userTasks, userGoals, userHabits)
    }
  }
}

function getDefaultInsights(
  userSessions: any[],
  userTasks: any[],
  userGoals: any[] = [],
  userHabits: any[] = [],
) {
  const insights = []

  const completedTasks = userTasks.filter((t) => t.status === "completed").length
  const pendingTasks = userTasks.filter((t) => t.status !== "completed").length

  if (pendingTasks > 10) {
    insights.push("💡 Consider breaking down large tasks into smaller, manageable chunks to reduce overwhelm.")
  }

  const highPriorityTasks = userTasks.filter((t) => t.priority === "high" && t.status !== "completed")
  if (highPriorityTasks.length > 3) {
    insights.push("🎯 Focus on completing high-priority tasks first. Consider using the Eisenhower Matrix.")
  }

  const completedSessions = userSessions.filter((s) => s.status === "completed")
  if (completedSessions.length > 0) {
    insights.push("✅ Great job staying consistent! Try to maintain your current work schedule.")
  } else {
    insights.push("🚀 Start with short 25-minute Pomodoro sessions to build momentum.")
  }

  // Goal-derived nudges.
  const overdueGoals = overdueGoalCount(userGoals)
  if (overdueGoals > 0) {
    insights.push(`⏰ You have ${overdueGoals} goal${overdueGoals > 1 ? "s" : ""} past their target date — review and reschedule or push them forward.`)
  } else if (userGoals.some((g) => g.status === "active")) {
    insights.push("🎯 Break each active goal into concrete next-step tasks to keep momentum going.")
  }

  // Habit-derived nudges: celebrate a streak, or flag habits still open today.
  // Compute stats once per habit, then derive both signals from that.
  const habitStats = userHabits.map((h) => computeHabitStats(h as Habit))
  const bestStreak = habitStats.reduce((max, s) => Math.max(max, s.currentStreak), 0)
  const pendingHabitsToday = habitStats.filter((s) => !s.todayDone).length
  if (bestStreak >= 3) {
    insights.push(`🔥 You're on a ${bestStreak}-day habit streak — keep it alive today!`)
  } else if (pendingHabitsToday > 0) {
    insights.push(`📅 ${pendingHabitsToday} habit${pendingHabitsToday > 1 ? "s" : ""} still need a check-in today.`)
  }

  if (userTasks.length === 0) {
    insights.push("📝 Create your first task to get started with tracking your productivity!")
  }

  if (insights.length === 0) {
    insights.push("💪 Keep up the good work! Regular task management helps maintain productivity.")
  }

  return insights.slice(0, 5)
}
