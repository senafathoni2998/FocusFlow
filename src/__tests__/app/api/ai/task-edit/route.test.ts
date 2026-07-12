/**
 * Unit tests for src/app/api/ai/task-edit/route.ts
 *
 * The endpoint turns a natural-language instruction into a PARTIAL field-change
 * delta for the edit form to pre-fill (it never writes to the DB). Tests cover
 * auth, validation, ownership, provider config, and — most importantly — that
 * every field is whitelisted/validated so a bad suggestion can't corrupt a field,
 * and that an empty/whitespace description is dropped (the no-clobber discipline).
 */

// Mock next/server - must be first due to hoisting
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "content-type": "application/json" },
      }),
  },
}))

// Mock OpenAI so getAIClient() returns a client whose create() we control.
const mockChatCreate = jest.fn()
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: (...args: any[]) => mockChatCreate(...args) } },
  })),
}))

// Mock prisma
const mockTaskFindFirst = jest.fn()
const mockListFindMany = jest.fn()
const mockGoalFindMany = jest.fn()
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: (...a: any[]) => mockTaskFindFirst(...a) },
    list: { findMany: (...a: any[]) => mockListFindMany(...a) },
    goal: { findMany: (...a: any[]) => mockGoalFindMany(...a) },
  },
}))

// Mock auth + settings provider preference
const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({ auth: (...a: any[]) => mockAuth(...a) }))
const mockGetUserAIProviderPref = jest.fn()
jest.mock("@/app/actions/settings", () => ({
  getUserAIProviderPref: (...a: any[]) => mockGetUserAIProviderPref(...a),
}))

import { POST } from "@/app/api/ai/task-edit/route"

const createRequest = (body: any): any => ({ json: async () => body })

// Build a provider response that "calls" applyTaskEdit with the given args.
const mockEdit = (args: object) => {
  mockChatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "applyTaskEdit", arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  })
}

const baseTask = {
  id: "task-1",
  userId: "user-123",
  title: "Prepare DI",
  description: "existing notes",
  priority: "medium",
  dueDate: null,
  listId: null,
  goalId: null,
  tags: [{ tag: { name: "work" } }],
  recurrence: null,
}

describe("AI task-edit route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const k of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DEEPSEEK_API_KEY",
      "GEMINI_API_KEY",
      "AI_PROVIDER",
    ]) {
      delete process.env[k]
    }
    process.env.GROQ_API_KEY = "test-api-key"
    mockAuth.mockResolvedValue({ user: { id: "user-123" } })
    mockGetUserAIProviderPref.mockResolvedValue(null)
    mockTaskFindFirst.mockResolvedValue(baseTask)
    mockListFindMany.mockResolvedValue([])
    mockGoalFindMany.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.GROQ_API_KEY
  })

  it("401s without a session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(createRequest({ taskId: "task-1", instruction: "x" }))
    expect(res.status).toBe(401)
  })

  it("400s when taskId or instruction is missing", async () => {
    expect((await POST(createRequest({ instruction: "x" }))).status).toBe(400)
    expect((await POST(createRequest({ taskId: "task-1" }))).status).toBe(400)
    expect((await POST(createRequest({ taskId: "task-1", instruction: "" }))).status).toBe(400)
  })

  it("500s when no AI provider is configured", async () => {
    delete process.env.GROQ_API_KEY
    const res = await POST(createRequest({ taskId: "task-1", instruction: "x" }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("AI service not configured")
  })

  it("404s when the task isn't owned by the user", async () => {
    mockTaskFindFirst.mockResolvedValue(null)
    const res = await POST(createRequest({ taskId: "nope", instruction: "x" }))
    expect(res.status).toBe(404)
  })

  it("returns a partial delta of only the changed fields", async () => {
    mockEdit({ priority: "high", dueDate: "2026-07-17" })
    const res = await POST(
      createRequest({ taskId: "task-1", instruction: "high priority, due next friday" }),
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.changes).toEqual({ priority: "high", dueDate: "2026-07-17" })
  })

  it("drops an empty/whitespace description (no clobber)", async () => {
    mockEdit({ dueDate: "2026-07-17", description: "   " })
    const data = await (await POST(createRequest({ taskId: "task-1", instruction: "set due date" }))).json()
    expect(data.changes).not.toHaveProperty("description")
    expect(data.changes.dueDate).toBe("2026-07-17")
  })

  it("keeps a real description the user asked for", async () => {
    mockEdit({ description: "- step one\n- step two" })
    const data = await (await POST(createRequest({ taskId: "task-1", instruction: "set notes" }))).json()
    expect(data.changes.description).toBe("- step one\n- step two")
  })

  it("resolves a list name to its id, and 'none' to null; skips unknown lists", async () => {
    mockListFindMany.mockResolvedValue([{ id: "list-work", name: "Work" }])

    mockEdit({ list: "work" })
    let data = await (await POST(createRequest({ taskId: "task-1", instruction: "move to work" }))).json()
    expect(data.changes.listId).toBe("list-work")

    mockEdit({ list: "none" })
    data = await (await POST(createRequest({ taskId: "task-1", instruction: "back to inbox" }))).json()
    expect(data.changes.listId).toBeNull()

    mockEdit({ list: "Nonexistent" })
    data = await (await POST(createRequest({ taskId: "task-1", instruction: "move somewhere" }))).json()
    expect(data.changes).not.toHaveProperty("listId")
  })

  it("returns the full deduped/trimmed tag set", async () => {
    mockEdit({ tags: ["work", " urgent ", "work", "  "] })
    const data = await (await POST(createRequest({ taskId: "task-1", instruction: "add urgent tag" }))).json()
    expect(data.changes.tags).toEqual(["work", "urgent"])
  })

  it("maps recurrence, including 'none' -> null", async () => {
    mockEdit({ recurrence: "weekly" })
    let data = await (await POST(createRequest({ taskId: "task-1", instruction: "repeat weekly" }))).json()
    expect(data.changes.recurrence).toBe("weekly")

    mockEdit({ recurrence: "none" })
    data = await (await POST(createRequest({ taskId: "task-1", instruction: "stop repeating" }))).json()
    expect(data.changes.recurrence).toBeNull()
  })

  it("skips invalid priority and unparseable dueDate, keeps empty-string dueDate", async () => {
    mockEdit({ priority: "urgent", dueDate: "next week" })
    let data = await (await POST(createRequest({ taskId: "task-1", instruction: "x" }))).json()
    expect(data.changes).not.toHaveProperty("priority")
    expect(data.changes).not.toHaveProperty("dueDate")

    mockEdit({ dueDate: "" })
    data = await (await POST(createRequest({ taskId: "task-1", instruction: "clear the date" }))).json()
    expect(data.changes.dueDate).toBe("")
  })

  it("forces the applyTaskEdit tool when calling the provider", async () => {
    mockEdit({ priority: "low" })
    await POST(createRequest({ taskId: "task-1", instruction: "low priority" }))
    const call = mockChatCreate.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: "function", function: { name: "applyTaskEdit" } })
    expect(call.tools[0].function.name).toBe("applyTaskEdit")
  })

  it("degrades to empty changes when the model returns no tool call", async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "I'm not sure" } }] })
    const res = await POST(createRequest({ taskId: "task-1", instruction: "???" }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.changes).toEqual({})
  })

  it("drops fields outside the editable whitelist (status/completed/reminders/arbitrary keys)", async () => {
    // Locks the contract that this endpoint can NEVER change status/completion or
    // reminders, even if the model tries — only whitelisted fields round-trip.
    mockEdit({
      status: "completed",
      completed: true,
      reminders: ["2026-08-01T09:00"],
      foo: "bar",
      priority: "low",
    })
    const data = await (
      await POST(createRequest({ taskId: "task-1", instruction: "finish and remind me" }))
    ).json()
    expect(data.changes).toEqual({ priority: "low" })
  })

  it("skips an impossible calendar date (2026-02-30) instead of reporting a change", async () => {
    mockEdit({ dueDate: "2026-02-30" })
    const data = await (
      await POST(createRequest({ taskId: "task-1", instruction: "due end of feb" }))
    ).json()
    expect(data.changes).not.toHaveProperty("dueDate")
  })

  it("400s on a malformed JSON body", async () => {
    const res = await POST({
      json: async () => {
        throw new Error("bad json")
      },
    } as any)
    expect(res.status).toBe(400)
  })

  it("400s when the instruction exceeds the length cap", async () => {
    const res = await POST(
      createRequest({ taskId: "task-1", instruction: "x".repeat(2001) }),
    )
    expect(res.status).toBe(400)
    // The task lookup / provider call must not run for a rejected request.
    expect(mockChatCreate).not.toHaveBeenCalled()
  })
})
