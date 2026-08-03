/**
 * @jest-environment node
 *
 * Route-level integration for the /api/v1/habits surface (list, create, patch,
 * delete, check-in, archive, archived-list): proves the handleRoute wrapper +
 * requireApiUser plumbing + JSON envelope work end to end, that every route is
 * scoped to the TOKEN's user rather than anything client-supplied, and that service
 * errors surface as their own status. habitService is mocked (unit-tested
 * separately); `jose` is stubbed; next/server's NextResponse.json is stubbed.
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

jest.mock("@/lib/services/habitService", () => ({
  getHabits: jest.fn(),
  getArchivedHabits: jest.fn(),
  createHabit: jest.fn(),
  updateHabit: jest.fn(),
  deleteHabit: jest.fn(),
  archiveHabit: jest.fn(),
  checkInHabit: jest.fn(),
}))

import { GET, POST } from "@/app/api/v1/habits/route"
import { GET as GET_ARCHIVED } from "@/app/api/v1/habits/archived/route"
import { PATCH, DELETE } from "@/app/api/v1/habits/[id]/route"
import { POST as CHECKIN } from "@/app/api/v1/habits/[id]/checkin/route"
import { POST as ARCHIVE } from "@/app/api/v1/habits/[id]/archive/route"
import {
  getHabits,
  getArchivedHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  archiveHabit,
  checkInHabit,
} from "@/lib/services/habitService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) }) as any

function req(authHeader: string | undefined, body?: unknown): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null) },
    json: async () => body,
  } as unknown as Request
}

/** A request whose body cannot be parsed — the readJson -> 400 path. */
function badBodyReq(authHeader: string): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader : null) },
    json: async () => {
      throw new SyntaxError("Unexpected token")
    },
  } as unknown as Request
}

const err = (res: { body: unknown }) => (res.body as { error: string }).error

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/habits", () => {
  it("returns 401 without a bearer token and never reaches the service", async () => {
    const res = await GET(req(undefined), ctx())
    expect(res.status).toBe(401)
    expect(err(res)).toMatch(/bearer/i)
    expect(getHabits).not.toHaveBeenCalled()
  })

  it("returns 401 for a garbage token", async () => {
    const res = await GET(req("Bearer not-a-real-token"), ctx())
    expect(res.status).toBe(401)
    expect(err(res)).toMatch(/invalid or expired/i)
    expect(getHabits).not.toHaveBeenCalled()
  })

  it("rejects a REFRESH token — only the access audience may read habits", async () => {
    const refresh = await signRefreshToken("u1")
    const res = await GET(req(`Bearer ${refresh}`), ctx())
    expect(res.status).toBe(401)
    expect(getHabits).not.toHaveBeenCalled()
  })

  it("returns 200 + habits scoped to the token's user", async () => {
    ;(getHabits as jest.Mock).mockResolvedValue([{ id: "h1", stats: { currentStreak: 3 } }])
    const token = await signAccessToken("u1")

    const res = await GET(req(`Bearer ${token}`), ctx())

    expect(res.status).toBe(200)
    expect((res.body as { habits: unknown[] }).habits).toEqual([{ id: "h1", stats: { currentStreak: 3 } }])
    expect(getHabits).toHaveBeenCalledWith("u1")
  })
})

describe("GET /api/v1/habits/archived", () => {
  it("401s without a token", async () => {
    const res = await GET_ARCHIVED(req(undefined), ctx())
    expect(res.status).toBe(401)
    expect(getArchivedHabits).not.toHaveBeenCalled()
  })

  it("returns archived habits under the same `habits` key, for the token's user", async () => {
    ;(getArchivedHabits as jest.Mock).mockResolvedValue([{ id: "h-old" }])
    const token = await signAccessToken("u7")

    const res = await GET_ARCHIVED(req(`Bearer ${token}`), ctx())

    expect(res.status).toBe(200)
    expect((res.body as { habits: unknown[] }).habits).toEqual([{ id: "h-old" }])
    expect(getArchivedHabits).toHaveBeenCalledWith("u7")
    expect(getHabits).not.toHaveBeenCalled()
  })
})

describe("POST /api/v1/habits", () => {
  it("creates a habit (201) and passes the body straight through", async () => {
    ;(createHabit as jest.Mock).mockResolvedValue({ id: "h2", name: "Run" })
    const token = await signAccessToken("u9")

    const res = await POST(req(`Bearer ${token}`, { name: "Run" }), ctx())

    expect(res.status).toBe(201)
    expect((res.body as { habit: { id: string } }).habit.id).toBe("h2")
    expect(createHabit).toHaveBeenCalledWith("u9", { name: "Run" })
  })

  it("401s an unauthenticated create", async () => {
    const res = await POST(req(undefined, { name: "Run" }), ctx())
    expect(res.status).toBe(401)
    expect(createHabit).not.toHaveBeenCalled()
  })

  it("400s a malformed JSON body", async () => {
    const token = await signAccessToken("u9")
    const res = await POST(badBodyReq(`Bearer ${token}`), ctx())
    expect(res.status).toBe(400)
    expect(err(res)).toMatch(/malformed json/i)
    expect(createHabit).not.toHaveBeenCalled()
  })

  it("surfaces a service validation ZodError as a 400 envelope, not a 500", async () => {
    const { z } = await import("zod")
    ;(createHabit as jest.Mock).mockRejectedValue(
      new z.ZodError([{ code: "too_small", minimum: 1, type: "string", inclusive: true, path: ["name"], message: "Required" }])
    )
    const token = await signAccessToken("u9")

    const res = await POST(req(`Bearer ${token}`, { name: "" }), ctx())

    expect(res.status).toBe(400)
    expect(err(res)).toBe("Invalid input")
    expect((res.body as { details: unknown[] }).details).toHaveLength(1)
  })
})

describe("PATCH /api/v1/habits/:id", () => {
  it("passes the token's user, the route id and the body to updateHabit", async () => {
    ;(updateHabit as jest.Mock).mockResolvedValue({ id: "h1", name: "Read" })
    const token = await signAccessToken("u1")

    const res = await PATCH(req(`Bearer ${token}`, { name: "Read" }), ctx({ id: "h1" }))

    expect(res.status).toBe(200)
    expect((res.body as { habit: { name: string } }).habit.name).toBe("Read")
    expect(updateHabit).toHaveBeenCalledWith("u1", "h1", { name: "Read" })
  })

  it("401s without a token even when an id is supplied", async () => {
    const res = await PATCH(req(undefined, { name: "Read" }), ctx({ id: "h1" }))
    expect(res.status).toBe(401)
    expect(updateHabit).not.toHaveBeenCalled()
  })

  it("returns the service's 404 (another user's habit) as a 404 envelope", async () => {
    const { notFound } = await import("@/lib/apiResponse")
    ;(updateHabit as jest.Mock).mockRejectedValue(notFound("Habit not found"))
    const token = await signAccessToken("u1")

    const res = await PATCH(req(`Bearer ${token}`, { name: "x" }), ctx({ id: "foreign" }))

    expect(res.status).toBe(404)
    expect(err(res)).toBe("Habit not found")
  })
})

describe("DELETE /api/v1/habits/:id", () => {
  it("deletes for the token's user and returns the service payload", async () => {
    ;(deleteHabit as jest.Mock).mockResolvedValue({ success: true })
    const token = await signAccessToken("u1")

    const res = await DELETE(req(`Bearer ${token}`), ctx({ id: "h1" }))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(deleteHabit).toHaveBeenCalledWith("u1", "h1")
  })

  it("401s an unauthenticated delete — no habit is touched", async () => {
    const res = await DELETE(req(undefined), ctx({ id: "h1" }))
    expect(res.status).toBe(401)
    expect(deleteHabit).not.toHaveBeenCalled()
  })

  it("hides an unexpected service crash behind a generic 500", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ;(deleteHabit as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"))
    const token = await signAccessToken("u1")

    const res = await DELETE(req(`Bearer ${token}`), ctx({ id: "h1" }))

    expect(res.status).toBe(500)
    expect(err(res)).toBe("Internal server error")
    expect(err(res)).not.toMatch(/ECONNREFUSED/)
    spy.mockRestore()
  })
})

describe("POST /api/v1/habits/:id/checkin", () => {
  it("forwards the delta/date body and returns the recomputed habit", async () => {
    ;(checkInHabit as jest.Mock).mockResolvedValue({ success: true, habit: { id: "h1", stats: {} } })
    const token = await signAccessToken("u1")

    const res = await CHECKIN(req(`Bearer ${token}`, { delta: -1, date: "2026-08-03" }), ctx({ id: "h1" }))

    expect(res.status).toBe(200)
    expect((res.body as { habit: { id: string } }).habit.id).toBe("h1")
    expect(checkInHabit).toHaveBeenCalledWith("u1", "h1", { delta: -1, date: "2026-08-03" })
  })

  it("401s an unauthenticated check-in — habit ids are not a capability", async () => {
    const res = await CHECKIN(req(undefined, { delta: 1 }), ctx({ id: "h1" }))
    expect(res.status).toBe(401)
    expect(checkInHabit).not.toHaveBeenCalled()
  })

  it("returns the service's 400 for an out-of-range date", async () => {
    const { badRequest } = await import("@/lib/apiResponse")
    ;(checkInHabit as jest.Mock).mockRejectedValue(badRequest("Invalid date"))
    const token = await signAccessToken("u1")

    const res = await CHECKIN(req(`Bearer ${token}`, { date: "2999-01-01" }), ctx({ id: "h1" }))

    expect(res.status).toBe(400)
    expect(err(res)).toBe("Invalid date")
  })
})

describe("POST /api/v1/habits/:id/archive", () => {
  it("archives by default when the body omits `archived`", async () => {
    ;(archiveHabit as jest.Mock).mockResolvedValue({ success: true })
    const token = await signAccessToken("u1")

    const res = await ARCHIVE(req(`Bearer ${token}`, {}), ctx({ id: "h1" }))

    expect(res.status).toBe(200)
    expect(archiveHabit).toHaveBeenCalledWith("u1", "h1", true)
  })

  it("UNarchives when the body explicitly sends archived:false", async () => {
    // `?? true` must not swallow an explicit false, or archiving is a one-way trip.
    ;(archiveHabit as jest.Mock).mockResolvedValue({ success: true })
    const token = await signAccessToken("u1")

    await ARCHIVE(req(`Bearer ${token}`, { archived: false }), ctx({ id: "h1" }))

    expect(archiveHabit).toHaveBeenCalledWith("u1", "h1", false)
  })

  it("401s an unauthenticated archive", async () => {
    const res = await ARCHIVE(req(undefined, { archived: true }), ctx({ id: "h1" }))
    expect(res.status).toBe(401)
    expect(archiveHabit).not.toHaveBeenCalled()
  })

  it("rejects a non-boolean `archived` with a 400 rather than a Prisma 500", async () => {
    // The route parses instead of casting: a TypeScript cast is erased at
    // runtime, so a string used to reach Prisma's Boolean column and blow up
    // there — an opaque 500 where every sibling habit route answers 400.
    const token = await signAccessToken("u1")

    const res = await ARCHIVE(req(`Bearer ${token}`, { archived: "nope" }), ctx({ id: "h1" }))

    expect(res.status).toBe(400)
    expect(archiveHabit).not.toHaveBeenCalled()
  })
})
