/**
 * Unit tests for src/app/api/ai/subtasks/route.ts — suggests subtask titles for a
 * task (ownership-scoped). It only proposes; it never creates anything.
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

const mockTaskFindFirst = jest.fn()
const mockTaskFindMany = jest.fn()
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: (...a: any[]) => mockTaskFindFirst(...a),
      findMany: (...a: any[]) => mockTaskFindMany(...a),
    },
  },
}))

const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({ auth: (...a: any[]) => mockAuth(...a) }))
const mockGetUserAIProviderPref = jest.fn()
jest.mock("@/app/actions/settings", () => ({
  getUserAIProviderPref: (...a: any[]) => mockGetUserAIProviderPref(...a),
}))

import { POST } from "@/app/api/ai/subtasks/route"

const createRequest = (body: any): any => ({ json: async () => body })

const mockSuggest = (subtasks: unknown) => {
  mockChatCreate.mockResolvedValue({
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: "c",
          type: "function",
          function: { name: "suggestSubtasks", arguments: JSON.stringify({ subtasks }) },
        }],
      },
    }],
  })
}

describe("AI subtasks route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER"]) {
      delete process.env[k]
    }
    process.env.GROQ_API_KEY = "test-key"
    mockAuth.mockResolvedValue({ user: { id: "user-123" } })
    mockGetUserAIProviderPref.mockResolvedValue(null)
    mockTaskFindFirst.mockResolvedValue({ title: "Launch the blog", description: "with markdown" })
    mockTaskFindMany.mockResolvedValue([])
  })
  afterEach(() => {
    delete process.env.GROQ_API_KEY
  })

  it("401s without a session", async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(createRequest({ taskId: "t1" }))).status).toBe(401)
  })

  it("400s when taskId is missing / body malformed", async () => {
    expect((await POST(createRequest({}))).status).toBe(400)
    expect((await POST({ json: async () => { throw new Error("x") } } as any)).status).toBe(400)
  })

  it("500s when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY
    expect((await POST(createRequest({ taskId: "t1" }))).status).toBe(500)
  })

  it("404s when the task isn't owned by the user", async () => {
    mockTaskFindFirst.mockResolvedValue(null)
    expect((await POST(createRequest({ taskId: "nope" }))).status).toBe(404)
  })

  it("returns the suggested subtask titles", async () => {
    mockSuggest(["Draft the outline", "Write the intro", "Publish"])
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual(["Draft the outline", "Write the intro", "Publish"])
  })

  it("dedupes against existing subtasks and within the list, and trims/drops empties", async () => {
    mockTaskFindMany.mockResolvedValue([{ title: "Publish" }])
    mockSuggest(["  Draft the outline  ", "Draft the outline", "publish", "", "Write the intro"])
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    // "publish" dropped (dupe of existing), the second "Draft the outline" dropped
    // (dupe), empty dropped, values trimmed.
    expect(data.subtasks).toEqual(["Draft the outline", "Write the intro"])
  })

  it("caps at exactly 8 distinct valid items, dropping the 9th", async () => {
    mockSuggest(Array.from({ length: 9 }, (_, i) => `Step ${i}`))
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual(Array.from({ length: 8 }, (_, i) => `Step ${i}`))
  })

  it("drops non-string items and overlong titles", async () => {
    mockSuggest([42, null, "Real thing", "x".repeat(201)])
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual(["Real thing"])
  })

  it("returns [] when subtasks is not an array", async () => {
    mockSuggest("not an array")
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual([])
  })

  it("returns [] on malformed tool-call arguments", async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "c",
            type: "function",
            function: { name: "suggestSubtasks", arguments: "{bad json" },
          }],
        },
      }],
    })
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual([])
  })

  it("returns an empty list when the model returns no tool call", async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "hmm" } }] })
    const data = await (await POST(createRequest({ taskId: "t1" }))).json()
    expect(data.subtasks).toEqual([])
  })

  it("forces the suggestSubtasks tool", async () => {
    mockSuggest(["A"])
    await POST(createRequest({ taskId: "t1" }))
    expect(mockChatCreate.mock.calls[0][0].tool_choice).toEqual({
      type: "function",
      function: { name: "suggestSubtasks" },
    })
  })
})
