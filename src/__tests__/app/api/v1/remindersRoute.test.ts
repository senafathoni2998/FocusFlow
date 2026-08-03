/**
 * @jest-environment node
 *
 * Route-level integration for /api/v1/reminders/{due,dispatch}: proves the
 * handleRoute wrapper + requireApiUser plumbing + JSON envelope work end to end,
 * and — the point of this surface — that the userId handed to the service always
 * comes from the verified token and never from the request body. The reminder
 * service is mocked (unit-tested separately); `jose` is stubbed; next/server's
 * NextResponse.json is stubbed to a readable object.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      headers: new Map(),
    }),
  },
}))

jest.mock("jose", () => {
  class SignJWT {
    private p: Record<string, unknown>
    constructor(payload: Record<string, unknown>) {
      this.p = { ...payload }
    }
    setProtectedHeader() {
      return this
    }
    setIssuedAt() {
      return this
    }
    setIssuer(iss: string) {
      this.p.iss = iss
      return this
    }
    setAudience(aud: string) {
      this.p.aud = aud
      return this
    }
    setExpirationTime() {
      return this
    }
    async sign() {
      return "mock." + Buffer.from(JSON.stringify(this.p)).toString("base64")
    }
  }
  async function jwtVerify(token: string, _k: unknown, opts?: { issuer?: string; audience?: string }) {
    const payload = JSON.parse(Buffer.from(String(token).replace(/^mock\./, ""), "base64").toString("utf8"))
    if (opts?.issuer && payload.iss !== opts.issuer) throw new Error("iss")
    if (opts?.audience && payload.aud !== opts.audience) throw new Error("aud")
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

jest.mock("@/lib/services/reminderService", () => ({
  getDueReminders: jest.fn(),
  markRemindersDispatched: jest.fn(),
}))

import { GET } from "@/app/api/v1/reminders/due/route"
import { POST } from "@/app/api/v1/reminders/dispatch/route"
import { getDueReminders, markRemindersDispatched } from "@/lib/services/reminderService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any

/** `body` as a thrown value simulates a malformed JSON payload. */
function req(authHeader: string | undefined, body?: unknown): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null) },
    json: async () => {
      if (body instanceof Error) throw body
      return body
    },
  } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/reminders/due", () => {
  it("returns 401 without a bearer token and never touches the database", async () => {
    const res = await GET(req(undefined), ctx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(getDueReminders).not.toHaveBeenCalled()
  })

  it("returns 401 for a refresh token used as an access token", async () => {
    // Refresh tokens carry a different audience; accepting one here would let a
    // long-lived credential read data directly.
    const res = await GET(req(`Bearer ${await signRefreshToken("u1")}`), ctx)
    expect(res.status).toBe(401)
    expect(getDueReminders).not.toHaveBeenCalled()
  })

  it("returns 401 for a garbage token", async () => {
    const res = await GET(req("Bearer not-a-real-token"), ctx)
    expect(res.status).toBe(401)
    expect(getDueReminders).not.toHaveBeenCalled()
  })

  it("scopes the lookup to the token's subject and wraps the rows in { reminders }", async () => {
    const rows = [{ id: "r1", task: { id: "t1", title: "Ship it" } }]
    ;(getDueReminders as jest.Mock).mockResolvedValue(rows)

    const res = await GET(req(`Bearer ${await signAccessToken("u1")}`), ctx)

    expect(res.status).toBe(200)
    expect((res.body as { reminders: unknown[] }).reminders).toEqual(rows)
    expect(getDueReminders).toHaveBeenCalledWith("u1")
  })

  it("returns 500 with a generic message when the service blows up, leaking nothing", async () => {
    ;(getDueReminders as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.4:5432"))
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})

    const res = await GET(req(`Bearer ${await signAccessToken("u1")}`), ctx)

    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe("Internal server error")
    spy.mockRestore()
  })
})

describe("POST /api/v1/reminders/dispatch", () => {
  it("returns 401 without a bearer token and never writes", async () => {
    const res = await POST(req(undefined, { ids: ["r1"] }), ctx)
    expect(res.status).toBe(401)
    expect(markRemindersDispatched).not.toHaveBeenCalled()
  })

  it("marks the caller's reminders and returns the service result verbatim", async () => {
    ;(markRemindersDispatched as jest.Mock).mockResolvedValue({ success: true, count: 2 })

    const res = await POST(req(`Bearer ${await signAccessToken("u1")}`, { ids: ["r1", "r2"] }), ctx)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, count: 2 })
    expect(markRemindersDispatched).toHaveBeenCalledWith("u1", { ids: ["r1", "r2"] })
  })

  it("ignores a userId smuggled in the body — the token's subject wins", async () => {
    ;(markRemindersDispatched as jest.Mock).mockResolvedValue({ success: true, count: 0 })

    await POST(
      req(`Bearer ${await signAccessToken("victim")}`, { ids: ["r1"], userId: "attacker" }),
      ctx
    )

    expect((markRemindersDispatched as jest.Mock).mock.calls[0][0]).toBe("victim")
  })

  it("returns 400 on a malformed JSON body", async () => {
    const res = await POST(
      req(`Bearer ${await signAccessToken("u1")}`, new SyntaxError("Unexpected token")),
      ctx
    )

    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/malformed json/i)
    expect(markRemindersDispatched).not.toHaveBeenCalled()
  })

  it("rejects an unauthenticated request before it even parses the body", async () => {
    const res = await POST(req(undefined, new SyntaxError("Unexpected token")), ctx)
    expect(res.status).toBe(401)
  })
})
