/**
 * @jest-environment node
 *
 * Route-level integration for GET /api/v1/analytics: proves the handleRoute +
 * requireApiUser plumbing, that the dashboard is scoped to the *token's* subject,
 * and that the JSON envelope/status are right. analyticsService is mocked (its
 * arithmetic is unit-tested separately); `jose` is stubbed because it is ESM-only.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      headers: new Map<string, string>(),
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

jest.mock("@/lib/services/analyticsService", () => ({
  getDashboard: jest.fn(),
}))

import { GET } from "@/app/api/v1/analytics/route"
import { getDashboard } from "@/lib/services/analyticsService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any

function req(authHeader?: string): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null) },
  } as unknown as Request
}

const SUMMARY = {
  tasks: {
    total: 5,
    byStatus: { todo: 3, "in-progress": 1, completed: 1, "wont-do": 0 },
    overdue: 1,
    dueToday: 2,
    completedToday: 1,
    completedThisWeek: 4,
  },
  focusMinutesThisWeek: 125,
  activeGoals: 2,
  habitCount: 3,
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/analytics — authentication", () => {
  it("401s without an Authorization header and never touches the service", async () => {
    const res = await GET(req(), ctx)

    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it("401s on a malformed bearer token", async () => {
    const res = await GET(req("Bearer not-a-real-token"), ctx)

    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/invalid or expired/i)
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it("401s when a REFRESH token is presented as an access token (wrong audience)", async () => {
    const refresh = await signRefreshToken("u1")

    const res = await GET(req(`Bearer ${refresh}`), ctx)

    expect(res.status).toBe(401)
    expect(getDashboard).not.toHaveBeenCalled()
  })

  it("401s on an 'Authorization: Bearer' header with no token value", async () => {
    const res = await GET(req("Bearer   "), ctx)

    expect(res.status).toBe(401)
    expect(getDashboard).not.toHaveBeenCalled()
  })
})

describe("GET /api/v1/analytics — success envelope", () => {
  it("returns 200 with the dashboard summary inlined at the top level", async () => {
    ;(getDashboard as jest.Mock).mockResolvedValue(SUMMARY)
    const token = await signAccessToken("u1")

    const res = await GET(req(`Bearer ${token}`), ctx)

    expect(res.status).toBe(200)
    // The analytics route is the one /api/v1 endpoint that is not wrapped in a
    // named key — the summary object IS the response body.
    expect(res.body).toEqual(SUMMARY)
  })

  it("scopes the dashboard to the subject of the presented token, not any client input", async () => {
    ;(getDashboard as jest.Mock).mockResolvedValue(SUMMARY)
    const token = await signAccessToken("user-b")

    await GET(req(`Bearer ${token}`), ctx)

    expect(getDashboard).toHaveBeenCalledTimes(1)
    expect(getDashboard).toHaveBeenCalledWith("user-b")
  })
})

describe("GET /api/v1/analytics — failure handling", () => {
  it("turns an unexpected service error into a generic 500 that leaks nothing", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ;(getDashboard as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"))
    const token = await signAccessToken("u1")

    const res = await GET(req(`Bearer ${token}`), ctx)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "Internal server error" })
    spy.mockRestore()
  })
})
