/**
 * Unit tests for src/app/api/ai/quick-add/route.ts — the DATE fallback for the
 * quick-add omnibar. It returns { title, dueDate } (never creates the task) and
 * only accepts a real calendar date from the model.
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

const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({ auth: (...a: any[]) => mockAuth(...a) }))
const mockGetUserAIProviderPref = jest.fn()
jest.mock("@/app/actions/settings", () => ({
  getUserAIProviderPref: (...a: any[]) => mockGetUserAIProviderPref(...a),
}))

import { POST } from "@/app/api/ai/quick-add/route"

const createRequest = (body: any): any => ({ json: async () => body })

const mockResolve = (args: object) => {
  mockChatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "resolveQuickAdd", arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  })
}

describe("AI quick-add route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER"]) {
      delete process.env[k]
    }
    process.env.GROQ_API_KEY = "test-api-key"
    mockAuth.mockResolvedValue({ user: { id: "user-123" } })
    mockGetUserAIProviderPref.mockResolvedValue(null)
  })
  afterEach(() => {
    delete process.env.GROQ_API_KEY
  })

  it("401s without a session", async () => {
    mockAuth.mockResolvedValue(null)
    expect((await POST(createRequest({ text: "x" }))).status).toBe(401)
  })

  it("400s when text is missing", async () => {
    expect((await POST(createRequest({}))).status).toBe(400)
  })

  it("400s on a malformed JSON body", async () => {
    const res = await POST({ json: async () => { throw new Error("bad") } } as any)
    expect(res.status).toBe(400)
  })

  it("400s when the text exceeds the length cap", async () => {
    const res = await POST(createRequest({ text: "x".repeat(501) }))
    expect(res.status).toBe(400)
    expect(mockChatCreate).not.toHaveBeenCalled()
  })

  it("500s when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY
    expect((await POST(createRequest({ text: "x" }))).status).toBe(500)
  })

  it("returns the resolved title + dueDate", async () => {
    mockResolve({ title: "Demo", dueDate: "2026-07-24" })
    const data = await (await POST(createRequest({ text: "Demo next friday" }))).json()
    expect(data).toEqual({ title: "Demo", dueDate: "2026-07-24" })
  })

  it("nulls an impossible dueDate but keeps the title", async () => {
    mockResolve({ title: "Pay rent", dueDate: "2026-02-30" })
    const data = await (await POST(createRequest({ text: "Pay rent end of feb" }))).json()
    expect(data.title).toBe("Pay rent")
    expect(data.dueDate).toBeNull()
  })

  it("returns dueDate null when the model names no date", async () => {
    mockResolve({ title: "Brainstorm ideas" })
    const data = await (await POST(createRequest({ text: "Brainstorm ideas" }))).json()
    expect(data).toEqual({ title: "Brainstorm ideas", dueDate: null })
  })

  it("falls back to the raw text as title when the model returns no tool call", async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "hmm" } }] })
    const data = await (await POST(createRequest({ text: "Some task next payday" }))).json()
    expect(data).toEqual({ title: "Some task next payday", dueDate: null })
  })

  it("forces the resolveQuickAdd tool", async () => {
    mockResolve({ title: "x" })
    await POST(createRequest({ text: "x" }))
    const call = mockChatCreate.mock.calls[0][0]
    expect(call.tool_choice).toEqual({ type: "function", function: { name: "resolveQuickAdd" } })
  })
})
