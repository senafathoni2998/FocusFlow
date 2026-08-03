/**
 * @jest-environment node
 *
 * Route-level integration for the focus-session surface:
 *   GET/POST /api/v1/sessions, POST /api/v1/sessions/:id/{complete,cancel}
 * Proves the handleRoute wrapper + requireApiUser plumbing + JSON envelope, that
 * every handler scopes to the *token's* user, and that service errors (zod / 404)
 * surface as the right status. sessionService is mocked (unit-tested separately);
 * `jose` is stubbed; next/server's NextResponse.json is stubbed to a readable object.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
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

jest.mock("@/lib/services/sessionService", () => ({
  getUserSessions: jest.fn(),
  startSession: jest.fn(),
  completeSession: jest.fn(),
  cancelSession: jest.fn(),
  // The route imports this bound for its ?days check. Omitting it from the mock
  // makes it `undefined`, and `n > undefined` is always false — so the upper
  // bound silently stops being enforced and the test passes for the wrong reason.
  MAX_SESSION_DAYS: 366,
}))

import { z } from "zod"
import { GET, POST as startRoute } from "@/app/api/v1/sessions/route"
import { POST as completeRoute } from "@/app/api/v1/sessions/[id]/complete/route"
import { POST as cancelRoute } from "@/app/api/v1/sessions/[id]/cancel/route"
import {
  getUserSessions,
  startSession,
  completeSession,
  cancelSession,
} from "@/lib/services/sessionService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"
import { notFound } from "@/lib/apiResponse"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

const noCtx = { params: Promise.resolve({}) } as unknown as Parameters<typeof GET>[1]
const idCtx = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as unknown as Parameters<typeof completeRoute>[1]

function req(authHeader: string | undefined, opts: { url?: string; body?: unknown; badJson?: boolean } = {}) {
  return {
    url: opts.url ?? "http://localhost/api/v1/sessions",
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? (authHeader ?? null) : null) },
    json: async () => {
      if (opts.badJson) throw new SyntaxError("Unexpected token")
      return opts.body
    },
  } as unknown as Request
}

/** A genuine ZodError, so handleRoute's `instanceof z.ZodError` branch is exercised. */
function realZodError(): z.ZodError {
  try {
    z.object({ duration: z.number().int().positive() }).parse({ duration: -1 })
  } catch (e) {
    return e as z.ZodError
  }
  throw new Error("expected a ZodError")
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/sessions", () => {
  it("returns 401 without a bearer token and never touches the service", async () => {
    const res = await GET(req(undefined), noCtx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(getUserSessions).not.toHaveBeenCalled()
  })

  it("rejects a refresh token presented as an access token", async () => {
    // Wrong audience — a refresh token must not unlock the resource routes.
    const res = await GET(req(`Bearer ${await signRefreshToken("u1")}`), noCtx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/invalid or expired/i)
    expect(getUserSessions).not.toHaveBeenCalled()
  })

  it("scopes the listing to the token's user, not any client-supplied id", async () => {
    ;(getUserSessions as jest.Mock).mockResolvedValue([{ id: "s1" }])
    const res = await GET(
      req(`Bearer ${await signAccessToken("u1")}`, { url: "http://localhost/api/v1/sessions?userId=u2" }),
      noCtx,
    )
    expect(res.status).toBe(200)
    expect((res.body as { sessions: unknown[] }).sessions).toEqual([{ id: "s1" }])
    expect(getUserSessions).toHaveBeenCalledWith("u1", 30) // default window
  })

  it("passes a numeric ?days through", async () => {
    ;(getUserSessions as jest.Mock).mockResolvedValue([])
    await GET(req(`Bearer ${await signAccessToken("u1")}`, { url: "http://localhost/api/v1/sessions?days=7" }), noCtx)
    expect(getUserSessions).toHaveBeenCalledWith("u1", 7)
  })

  it("uses 30 days when ?days is absent", async () => {
    ;(getUserSessions as jest.Mock).mockResolvedValue([])
    await GET(req(`Bearer ${await signAccessToken("u1")}`), noCtx)
    expect(getUserSessions).toHaveBeenCalledWith("u1", 30)
  })

  it("rejects a ?days the caller got wrong instead of guessing", async () => {
    // Silently falling back to 30 hid the mistake; a negative value was worse
    // still, since it put startDate in the FUTURE and returned an empty 200 that
    // looked like "you have no sessions".
    const token = await signAccessToken("u1")
    for (const bad of ["lots", "-5", "0", "1.5", "100000"]) {
      const res = await GET(
        req(`Bearer ${token}`, { url: `http://localhost/api/v1/sessions?days=${bad}` }),
        noCtx,
      )
      expect(res.status).toBe(400)
    }
    expect(getUserSessions).not.toHaveBeenCalled()
  })

  it("accepts the bounds of the allowed window", async () => {
    ;(getUserSessions as jest.Mock).mockResolvedValue([])
    const token = await signAccessToken("u1")
    await GET(req(`Bearer ${token}`, { url: "http://localhost/api/v1/sessions?days=1" }), noCtx)
    await GET(req(`Bearer ${token}`, { url: "http://localhost/api/v1/sessions?days=366" }), noCtx)
    expect(getUserSessions).toHaveBeenNthCalledWith(1, "u1", 1)
    expect(getUserSessions).toHaveBeenNthCalledWith(2, "u1", 366)
  })
})

describe("POST /api/v1/sessions", () => {
  it("starts a session for the token's user and answers 201", async () => {
    ;(startSession as jest.Mock).mockResolvedValue({ id: "s9", status: "running" })
    const res = await startRoute(
      req(`Bearer ${await signAccessToken("u9")}`, { body: { duration: 1500, type: "pomodoro" } }),
      noCtx,
    )
    expect(res.status).toBe(201)
    expect((res.body as { session: { id: string } }).session.id).toBe("s9")
    expect(startSession).toHaveBeenCalledWith("u9", { duration: 1500, type: "pomodoro" })
  })

  it("401s an unauthenticated start", async () => {
    const res = await startRoute(req(undefined, { body: { duration: 1500 } }), noCtx)
    expect(res.status).toBe(401)
    expect(startSession).not.toHaveBeenCalled()
  })

  it("400s a malformed JSON body before reaching the service", async () => {
    const res = await startRoute(req(`Bearer ${await signAccessToken("u1")}`, { badJson: true }), noCtx)
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe("Malformed JSON body")
    expect(startSession).not.toHaveBeenCalled()
  })

  it("turns a validation failure into 400 Invalid input with details", async () => {
    ;(startSession as jest.Mock).mockRejectedValue(realZodError())
    const res = await startRoute(req(`Bearer ${await signAccessToken("u1")}`, { body: { duration: -1 } }), noCtx)
    expect(res.status).toBe(400)
    const body = res.body as { error: string; details: unknown[] }
    expect(body.error).toBe("Invalid input")
    expect(body.details.length).toBeGreaterThan(0)
  })

  it("surfaces the foreign-task ownership rejection as 404", async () => {
    ;(startSession as jest.Mock).mockRejectedValue(notFound("Task not found"))
    const res = await startRoute(
      req(`Bearer ${await signAccessToken("u1")}`, { body: { duration: 1500, taskId: "foreign" } }),
      noCtx,
    )
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("Task not found")
  })

  it("hides unexpected service failures behind a generic 500", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ;(startSession as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"))
    const res = await startRoute(req(`Bearer ${await signAccessToken("u1")}`, { body: { duration: 1500 } }), noCtx)
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe("Internal server error")
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED/)
    spy.mockRestore()
  })
})

describe("POST /api/v1/sessions/:id/complete", () => {
  it("401s without a token and never completes the session", async () => {
    const res = await completeRoute(req(undefined), idCtx("s1"))
    expect(res.status).toBe(401)
    expect(completeSession).not.toHaveBeenCalled()
  })

  it("completes the route param's session on behalf of the token's user", async () => {
    ;(completeSession as jest.Mock).mockResolvedValue({ id: "s1", status: "completed" })
    const res = await completeRoute(req(`Bearer ${await signAccessToken("u1")}`), idCtx("s1"))
    expect(res.status).toBe(200)
    expect((res.body as { session: { status: string } }).session.status).toBe("completed")
    expect(completeSession).toHaveBeenCalledWith("u1", "s1")
  })

  it("404s when the id belongs to someone else", async () => {
    ;(completeSession as jest.Mock).mockRejectedValue(notFound("Session not found"))
    const res = await completeRoute(req(`Bearer ${await signAccessToken("u1")}`), idCtx("s-foreign"))
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("Session not found")
  })
})

describe("POST /api/v1/sessions/:id/cancel", () => {
  it("401s without a token and never cancels the session", async () => {
    const res = await cancelRoute(req(undefined), idCtx("s1"))
    expect(res.status).toBe(401)
    expect(cancelSession).not.toHaveBeenCalled()
  })

  it("cancels the route param's session and returns the success envelope", async () => {
    ;(cancelSession as jest.Mock).mockResolvedValue({ success: true })
    const res = await cancelRoute(req(`Bearer ${await signAccessToken("u2")}`), idCtx("s5"))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(cancelSession).toHaveBeenCalledWith("u2", "s5")
  })

  it("404s when the id belongs to someone else", async () => {
    ;(cancelSession as jest.Mock).mockRejectedValue(notFound("Session not found"))
    const res = await cancelRoute(req(`Bearer ${await signAccessToken("u1")}`), idCtx("s-foreign"))
    expect(res.status).toBe(404)
  })
})
