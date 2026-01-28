import OpenAI from 'openai'

// Z.AI (智谱AI) provides OpenAI-compatible API
// Documentation: https://docs.z.ai/guides/overview/quick-start
const zai = new OpenAI({
  apiKey: process.env.ZAI_API_KEY || "",
  baseURL: "https://open.bigmodel.cn/api/paas/v4/"
})

export async function generateInsights(userSessions: any[], userTasks: any[]) {
  if (!process.env.ZAI_API_KEY) {
    return {
      error: "Z.AI API key not configured",
      insights: getDefaultInsights(userSessions, userTasks)
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

    const systemPrompt = `You are a productivity coach. Analyze the user's work patterns and provide 3-5 specific, actionable recommendations to improve productivity. Keep each recommendation concise (1-2 sentences) and practical.`

    const userPrompt = `Based on the following data:
- Total focus sessions: ${userSessions.length}
- Completed sessions: ${completedSessions.length}
- Total focus time: ${Math.floor(totalFocusTime / 60)} hours ${totalFocusTime % 60} minutes
- Total tasks: ${userTasks.length}
- Completed tasks: ${userTasks.filter((t) => t.status === "completed").length}
- Tasks in progress: ${userTasks.filter((t) => t.status === "in-progress").length}
- Tasks pending: ${userTasks.filter((t) => t.status === "todo").length}

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

Provide 3-5 specific, actionable recommendations to improve productivity.`

    // Using GLM-4-Flash model (faster and more cost-effective)
    const response = await zai.chat.completions.create({
      model: "glm-4-flash",
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
      insights: bulletPoints.length > 0 ? bulletPoints : getDefaultInsights(userSessions, userTasks)
    }
  } catch (error) {
    console.error("Z.AI API error:", error)
    return {
      error: "Failed to generate AI insights",
      insights: getDefaultInsights(userSessions, userTasks)
    }
  }
}

function getDefaultInsights(userSessions: any[], userTasks: any[]) {
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

  if (userTasks.length === 0) {
    insights.push("📝 Create your first task to get started with tracking your productivity!")
  }

  if (insights.length === 0) {
    insights.push("💪 Keep up the good work! Regular task management helps maintain productivity.")
  }

  return insights
}
