import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserAIProviderPref } from "@/app/actions/settings"
import { getAIClient } from "@/lib/aiProviders"
import OpenAI from "openai"

// POST /api/ai/subtasks — suggest a checklist of subtasks for a task. It ONLY
// proposes titles (it does not create anything); the client shows them for review
// and creates the selected ones as real subtasks via the createTask action.

const MAX_SUBTASKS = 8
const MAX_TITLE_LEN = 200

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "suggestSubtasks",
    description: "Break the task down into a short checklist of concrete, ordered subtasks.",
    parameters: {
      type: "object",
      properties: {
        subtasks: {
          type: "array",
          items: { type: "string" },
          description:
            "3-6 clear, actionable subtasks as short imperative phrases (e.g. 'Draft the outline'). Ordered by when they'd be done. Do not repeat the parent task or any existing subtask, and add no commentary.",
        },
      },
      required: ["subtasks"],
    },
  },
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { taskId } = body ?? {}
    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 })
    }

    const providerPref = await getUserAIProviderPref()
    const ai = getAIClient(providerPref)
    if (!ai) {
      return NextResponse.json(
        {
          error: "AI service not configured",
          message: "No AI provider is configured. Add an API key for a provider and pick it in Settings.",
        },
        { status: 500 },
      )
    }

    // Ownership-scoped task load + its existing subtasks (so we don't suggest dupes).
    const [task, existing] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, userId: session.user.id },
        select: { title: true, description: true },
      }),
      prisma.task.findMany({
        where: { parentTaskId: taskId, userId: session.user.id },
        select: { title: true },
      }),
    ])

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const existingTitles = existing.map((e) => e.title)
    const systemPrompt = `You break a task down into a short checklist of concrete, actionable subtasks. Call suggestSubtasks with 3-6 clear, ordered steps needed to complete the task. Each is a short imperative phrase. Do not repeat the parent task or any existing subtask, and add no commentary.`
    const userPrompt = `Task: ${task.title}
${task.description ? `Details: ${task.description}\n` : ""}${
      existingTitles.length ? `Existing subtasks (do NOT repeat these): ${JSON.stringify(existingTitles)}` : ""
    }`

    const response = await ai.client.chat.completions.create({
      model: ai.chatModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "suggestSubtasks" } },
      temperature: 0.4,
      max_tokens: 400,
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

    // Whitelist: trim, drop empties/overlong, dedupe (case-insensitive) against each
    // other AND the existing subtasks, then cap.
    const seen = new Set(existingTitles.map((t) => t.toLowerCase()))
    const subtasks: string[] = []
    if (Array.isArray(args.subtasks)) {
      for (const raw of args.subtasks) {
        if (typeof raw !== "string") continue
        const title = raw.trim()
        if (!title || title.length > MAX_TITLE_LEN) continue
        const key = title.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        subtasks.push(title)
        if (subtasks.length >= MAX_SUBTASKS) break
      }
    }

    return NextResponse.json({ subtasks })
  } catch (error) {
    console.error("AI subtasks error:", error)
    return NextResponse.json(
      { error: "Failed to suggest subtasks", message: "Sorry, something went wrong. Please try again." },
      { status: 500 },
    )
  }
}
