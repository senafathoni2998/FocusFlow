/**
 * @jest-environment node
 *
 * Route-level tests for POST /api/v1/auth/refresh and GET /api/v1/auth/me.
 *
 * Unlike the login/register suite, authService is NOT mocked here: the behaviour
 * worth pinning down is that the two token AUDIENCES are not interchangeable, and
 * that check lives in apiAuth, reached only through the real service. So Prisma is
 * the global mock and `jose` is stubbed with an issuer/audience-enforcing fake
 * (the real package is ESM-only and Jest can't parse it) — the same stub the
 * authService unit tests use.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      headers: new Headers(),
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
      this.p.iat = 1000
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
      this.p.exp = 9_999_999_999
      return this
    }
    async sign() {
      return "mock." + Buffer.from(JSON.stringify(this.p)).toString("base64")
    }
  }
  async function jwtVerify(token: string, _key: unknown, opts?: { issuer?: string; audience?: string }) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(Buffer.from(String(token).replace(/^mock\./, ""), "base64").toString("utf8"))
    } catch {
      throw new Error("bad token")
    }
    if (typeof payload !== "object" || payload === null) throw new Error("bad token")
    if (opts?.issuer && payload.iss !== opts.issuer) throw new Error("bad iss")
    if (opts?.audience && payload.aud !== opts.audience) throw new Error("bad aud")
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

import { POST as REFRESH } from "@/app/api/v1/auth/refresh/route"
import { GET as ME } from "@/app/api/v1/auth/me/route"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyOf = (res: any) => res.body as Record<string, any>

/** Read back the claims the stub encoded, so audiences are directly assertable. */
function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.replace(/^mock\./, ""), "base64").toString("utf8"))
}

function jsonReq(body: unknown, malformed = false): Request {
  return {
    headers: { get: () => null },
    json: async () => {
      if (malformed) throw new SyntaxError("Unexpected end of JSON input")
      return body
    },
  } as unknown as Request
}

function authedReq(header: string | undefined): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? (header ?? null) : null) },
    json: async () => ({}),
  } as unknown as Request
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/v1/auth/refresh", () => {
  it("exchanges a refresh token for a pair whose audiences are correct", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u5", email: "sena@gmail.com", name: "Sena" })
    const refreshToken = await signRefreshToken("u5")

    const res = await REFRESH(jsonReq({ refreshToken }), ctx)

    expect(res.status).toBe(200)
    expect(bodyOf(res).user).toEqual({ id: "u5", email: "sena@gmail.com", name: "Sena" })
    expect(bodyOf(res).tokenType).toBe("Bearer")
    // The whole point of the exchange: a usable ACCESS token, plus a refresh token
    // that still can't be used as one.
    expect(claims(bodyOf(res).accessToken)).toMatchObject({ sub: "u5", aud: "focusflow-mobile" })
    expect(claims(bodyOf(res).refreshToken)).toMatchObject({ sub: "u5", aud: "focusflow-mobile-refresh" })
    // Scoped to the token's subject, not to anything the caller sent.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u5" },
      select: { id: true, email: true, name: true },
    })
  })

  it("rejects an ACCESS token presented as a refresh token, before touching the database", async () => {
    const accessToken = await signAccessToken("u5")

    const res = await REFRESH(jsonReq({ refreshToken: accessToken }), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Invalid or expired refresh token" })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("rejects a garbage token with the same opaque 401", async () => {
    const res = await REFRESH(jsonReq({ refreshToken: "not-a-real-token" }), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Invalid or expired refresh token" })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("returns 400 when refreshToken is missing, empty or the wrong type", async () => {
    for (const body of [{}, { refreshToken: "" }, { refreshToken: 42 }, { refreshToken: null }, null]) {
      const res = await REFRESH(jsonReq(body), ctx)
      expect(res.status).toBe(400)
      expect(bodyOf(res).error).toBe("refreshToken is required")
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("returns 400 on a malformed JSON body", async () => {
    const res = await REFRESH(jsonReq(undefined, true), ctx)

    expect(res.status).toBe(400)
    expect(bodyOf(res).error).toBe("Malformed JSON body")
  })

  it("rejects a well-formed token whose user has since been deleted", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const refreshToken = await signRefreshToken("deleted-user")

    const res = await REFRESH(jsonReq({ refreshToken }), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Invalid or expired refresh token" })
  })
})

describe("GET /api/v1/auth/me", () => {
  it("returns the profile for the access token's subject and never a password", async () => {
    const profile = {
      id: "u7",
      email: "sena@gmail.com",
      name: "Sena",
      aiProvider: "gemini",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }
    prisma.user.findUnique.mockResolvedValue(profile)
    const token = await signAccessToken("u7")

    const res = await ME(authedReq(`Bearer ${token}`), ctx)

    expect(res.status).toBe(200)
    expect(bodyOf(res)).toEqual({ user: profile })
    // An explicit select is the only thing keeping the bcrypt hash out of the response.
    const select = prisma.user.findUnique.mock.calls[0][0].select
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: "u7" })
    expect(select).not.toHaveProperty("password")
    expect(select).toMatchObject({ id: true, email: true, name: true })
  })

  it("returns 401 when no Authorization header is present", async () => {
    const res = await ME(authedReq(undefined), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res).error).toMatch(/missing bearer token/i)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("rejects a REFRESH token — the audiences are not interchangeable", async () => {
    const refreshToken = await signRefreshToken("u7")

    const res = await ME(authedReq(`Bearer ${refreshToken}`), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Invalid or expired token" })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("rejects malformed Authorization headers", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u7" })
    const token = await signAccessToken("u7")

    // No scheme, wrong scheme, and a bearer with nothing after it.
    for (const header of [token, `Basic ${token}`, "Bearer", "Bearer "]) {
      const res = await ME(authedReq(header), ctx)
      expect(res.status).toBe(401)
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("accepts a case-insensitive bearer scheme with surrounding whitespace", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u7", email: "s@x.com", name: null })
    const token = await signAccessToken("u7")

    const res = await ME(authedReq(`  bearer   ${token}  `), ctx)

    expect(res.status).toBe(200)
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u7" } }))
  })

  it("returns 401, not 200 with a null user, when the account no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const token = await signAccessToken("ghost")

    const res = await ME(authedReq(`Bearer ${token}`), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Unauthorized" })
  })

  it("scopes the lookup to the token's subject, so two tokens never see each other's profile", async () => {
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "alice" ? { id: "alice", email: "alice@x.com", name: "Alice" } : { id: "bob", email: "bob@x.com", name: "Bob" },
    )

    const alice = await ME(authedReq(`Bearer ${await signAccessToken("alice")}`), ctx)
    const bob = await ME(authedReq(`Bearer ${await signAccessToken("bob")}`), ctx)

    expect(bodyOf(alice).user.id).toBe("alice")
    expect(bodyOf(bob).user.id).toBe("bob")
  })
})
