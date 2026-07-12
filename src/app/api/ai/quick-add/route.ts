import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUserAIProviderPref } from "@/app/actions/settings"
import { getAIClient } from "@/lib/aiProviders"
import OpenAI from "openai"

// This endpoint is the DATE fallback for the quick-add omnibar: the client has
// already stripped #tags and !priority deterministically, so here we only ask the
// model to split the remaining line into a clean title and (if present) a due
// date it couldn't resolve locally (e.g. "next friday", "end of month", "aug 1").
// It never creates the task — the client does that via the createTask action.

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

// True only for a real calendar day in strict YYYY-MM-DD form.
function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

const MAX_TEXT_LEN = 500

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "resolveQuickAdd",
    description:
      "Split a quick-add task line into a clean title and, if the line names one, a due date.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "The task title with any date/time words removed (e.g. 'Demo next friday' -> 'Demo'). Keep the rest of the wording as the user typed it.",
        },
        dueDate: {
          type: "string",
          description:
            "The due date as YYYY-MM-DD if the line clearly names one; otherwise omit this field. Never guess a date the user didn't state.",
        },
      },
      required: ["title"],
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

    const { text } = body ?? {}
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 })
    }
    if (text.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: `Text is too long (max ${MAX_TEXT_LEN} characters)` },
        { status: 400 },
      )
    }

    const providerPref = await getUserAIProviderPref()
    const ai = getAIClient(providerPref)
    if (!ai) {
      return NextResponse.json(
        {
          error: "AI service not configured",
          message: "No AI provider is configured.",
        },
        { status: 500 },
      )
    }

    const now = new Date()
    const todayHuman = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const systemContent = `Split a quick-add task line into a title and an optional due date. Call resolveQuickAdd. Today is ${todayHuman} (ISO: ${formatLocalDate(
      now,
    )}). Resolve any relative or fuzzy date the line names ("next friday", "end of month", "aug 1", "in 2 months") to a concrete YYYY-MM-DD and remove those date words from the title. If the line names NO date, omit dueDate entirely — never invent one.`

    const response = await ai.client.chat.completions.create({
      model: ai.chatModel,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: text },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "resolveQuickAdd" } },
      temperature: 0.1,
      max_tokens: 256,
    })

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    let args: Record<string, any> = {}
    if (toolCall) {
      try {
        args = JSON.parse(toolCall.function.arguments || "{}")
      } catch {
        args = {}
      }
    }

    // Fall back to the raw text as the title if the model didn't return a usable
    // one, and only accept a real calendar date.
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : text.trim()
    const dueDate =
      typeof args.dueDate === "string" && isValidYmd(args.dueDate) ? args.dueDate : null

    return NextResponse.json({ title, dueDate })
  } catch (error) {
    console.error("AI quick-add error:", error)
    return NextResponse.json(
      { error: "Failed to interpret the task", message: "Sorry, something went wrong." },
      { status: 500 },
    )
  }
}
