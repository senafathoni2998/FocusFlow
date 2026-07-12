import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserAIProviderPref } from "@/app/actions/settings"
import { getAIClient } from "@/lib/aiProviders"
import { TASK_PRIORITIES } from "@/lib/taskConstants"
import { isRecurrenceFreq } from "@/lib/recurrence"
import OpenAI from "openai"

// Format a Date as YYYY-MM-DD in the server's local time — the same basis the
// task actions use to store all-day dates, so displayed/parsed dates stay aligned.
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

// True only for a real calendar day in strict YYYY-MM-DD form (rejects 2026-02-30,
// 2026-13-01, etc.), matching parseDateInput's own round-trip check — so we never
// report a due-date change that updateTask would then drop as unparseable.
function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

// Cap the instruction so an authenticated caller can't push unbounded prompt-token
// cost through the shared provider key.
const MAX_INSTRUCTION_LEN = 2000

// A single tool the model must call. It mirrors the fields EditTaskForm can edit,
// and — like the chat assistant's updateTask — it is a PARTIAL edit: the model
// includes only the fields the user asked to change. We do NOT apply these to the
// database; the endpoint returns them for the edit form to pre-fill and the user
// to review + Save, so the human stays in the loop.
const editTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "applyTaskEdit",
    description:
      "Return the set of task fields to change based on the user's instruction. This is a PARTIAL edit: include ONLY the fields the user explicitly asked to change; omit everything else so it keeps its current value.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "New title — only if the user is renaming the task.",
        },
        description: {
          type: "string",
          description:
            "New description text — ONLY when the user explicitly gives new description content. Omit it otherwise; this field replaces the whole description. Preserve the user's exact markdown (bullets '-', headers '#').",
        },
        priority: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
          description: "New priority ('none' clears the priority).",
        },
        dueDate: {
          type: "string",
          description: 'New due date as YYYY-MM-DD, or an empty string "" to clear it.',
        },
        list: {
          type: "string",
          description:
            "Exact name of the list to move the task to (from AVAILABLE LISTS), or 'none' to move it to the Inbox.",
        },
        goal: {
          type: "string",
          description:
            "Exact title of the goal to link (from AVAILABLE GOALS), or 'none' to unlink the goal.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "The COMPLETE resulting tag list after the edit — include the existing tags the user is keeping, not just the new ones.",
        },
        recurrence: {
          type: "string",
          enum: ["daily", "weekly", "monthly", "yearly", "none"],
          description: "Repeat frequency, or 'none' to stop repeating.",
        },
      },
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

    const { taskId, instruction } = body ?? {}
    if (
      !taskId ||
      typeof taskId !== "string" ||
      !instruction ||
      typeof instruction !== "string"
    ) {
      return NextResponse.json(
        { error: "taskId and instruction are required" },
        { status: 400 },
      )
    }
    if (instruction.length > MAX_INSTRUCTION_LEN) {
      return NextResponse.json(
        { error: `Instruction is too long (max ${MAX_INSTRUCTION_LEN} characters)` },
        { status: 400 },
      )
    }

    const providerPref = await getUserAIProviderPref()
    const ai = getAIClient(providerPref)
    if (!ai) {
      return NextResponse.json(
        {
          error: "AI service not configured",
          message:
            "No AI provider is configured. Add an API key for a provider and pick it in Settings.",
        },
        { status: 500 },
      )
    }

    // Load the task (ownership-scoped) + the user's lists/goals so the model can
    // resolve "move to my Work list" / "link to goal X" by name.
    const [task, lists, goals] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, userId: session.user.id },
        include: { tags: { include: { tag: true } }, recurrence: true },
      }),
      prisma.list.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true },
      }),
      prisma.goal.findMany({
        where: { userId: session.user.id, status: { not: "archived" } },
        select: { id: true, title: true },
      }),
    ])

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const currentTags = (task.tags ?? []).map((tt) => tt.tag.name)
    const now = new Date()
    const todayISO = formatLocalDate(now)
    const todayHuman = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const systemContent = `You translate a user's natural-language instruction into a set of field changes for ONE existing task. Call applyTaskEdit with ONLY the fields the user asked to change; omit the rest so they keep their current values. Do NOT include "description" unless the user explicitly gives new description text (that field replaces the whole description). Today is ${todayHuman} (ISO: ${todayISO}); resolve relative dates like "tomorrow" / "next friday" against it and always output dueDate as YYYY-MM-DD (or "" to clear it).

CURRENT TASK:
- Title: ${task.title}
- Description: ${task.description ? "(has notes — leave unchanged unless the user is editing the description)" : "(empty)"}
- Priority: ${task.priority}
- Due date: ${task.dueDate ? formatLocalDate(new Date(task.dueDate)) : "(none)"}
- List: ${lists.find((l) => l.id === task.listId)?.name ?? "Inbox"}
- Goal: ${goals.find((g) => g.id === task.goalId)?.title ?? "(none)"}
- Tags: ${currentTags.length ? currentTags.join(", ") : "(none)"}
- Repeat: ${task.recurrence?.freq ?? "(does not repeat)"}

AVAILABLE LISTS: ${lists.length ? lists.map((l) => l.name).join(", ") : "(none — only Inbox)"}
AVAILABLE GOALS: ${goals.length ? goals.map((g) => g.title).join(", ") : "(none)"}

If the instruction changes tags, return the COMPLETE resulting tag list (keep the existing tags the user isn't removing).`

    const response = await ai.client.chat.completions.create({
      model: ai.chatModel,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: instruction },
      ],
      tools: [editTool],
      // Force the tool so we reliably get structured output back across providers.
      tool_choice: { type: "function", function: { name: "applyTaskEdit" } },
      temperature: 0.2,
      max_tokens: 512,
    })

    // Parse the tool call. Any failure to extract a clean argument object degrades
    // to "no changes" rather than an error — the form shows a friendly "nothing to
    // change, try rephrasing" and the task is never mutated (this endpoint never
    // writes; it only proposes a delta).
    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    let args: Record<string, any> = {}
    if (toolCall) {
      try {
        args = JSON.parse(toolCall.function.arguments || "{}")
      } catch {
        args = {}
      }
    }

    // Whitelist + validate every field. Anything invalid is SKIPPED (not guessed),
    // so a bad suggestion can never silently corrupt a field. The returned shape
    // matches EditTaskForm's own field state so the client can apply it directly.
    const changes: Record<string, unknown> = {}

    if (typeof args.title === "string" && args.title.trim()) {
      changes.title = args.title.trim()
    }

    // Same no-clobber discipline as the chat path: an empty/whitespace description
    // is never an intended change, so drop it.
    if (typeof args.description === "string" && args.description.trim()) {
      changes.description = args.description
    }

    if (
      typeof args.priority === "string" &&
      (TASK_PRIORITIES as readonly string[]).includes(args.priority)
    ) {
      changes.priority = args.priority
    }

    if (typeof args.dueDate === "string") {
      // Empty string clears; otherwise require a REAL calendar day so a vague or
      // impossible value (e.g. 2026-02-30) can't reach the form — which would show
      // a blank date + a misleading "changed" banner while Save silently keeps the
      // old date.
      if (args.dueDate === "" || isValidYmd(args.dueDate)) {
        changes.dueDate = args.dueDate
      }
    }

    if (typeof args.list === "string") {
      const v = args.list.trim().toLowerCase()
      if (v === "none" || v === "inbox" || v === "") {
        changes.listId = null
      } else {
        const match = lists.find((l) => l.name.toLowerCase() === v)
        if (match) changes.listId = match.id
      }
    }

    if (typeof args.goal === "string") {
      const v = args.goal.trim().toLowerCase()
      if (v === "none" || v === "") {
        changes.goalId = null
      } else {
        const match = goals.find((g) => g.title.toLowerCase() === v)
        if (match) changes.goalId = match.id
      }
    }

    if (Array.isArray(args.tags)) {
      changes.tags = Array.from(
        new Set(
          args.tags
            .filter((t: unknown): t is string => typeof t === "string")
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0),
        ),
      )
    }

    if (typeof args.recurrence === "string") {
      const v = args.recurrence.trim().toLowerCase()
      if (v === "none" || v === "") changes.recurrence = null
      else if (isRecurrenceFreq(v)) changes.recurrence = v
    }

    return NextResponse.json({ changes })
  } catch (error) {
    console.error("AI task-edit error:", error)
    return NextResponse.json(
      {
        error: "Failed to interpret the edit",
        message: "Sorry, something went wrong. Please try again.",
      },
      { status: 500 },
    )
  }
}
