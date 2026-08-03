/**
 * @jest-environment node
 *
 * Companion to `apiAuth.test.ts`, which already covers the happy paths and the
 * access/refresh audience isolation. This file pins the EDGE cases that decide
 * whether a request is trusted: exact Authorization-header parsing, tokens whose
 * payload is well-formed but subject-less or expired, the token pair's wire
 * contract with the Flutter client, and what happens when the signing secret is
 * missing from the environment.
 *
 * `jose` is ESM-only and unparseable by Jest, so it is stubbed with a functional
 * fake that still enforces issuer, audience and expiry — the properties this
 * wrapper's security rests on. Real HS256 crypto is exercised at runtime.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

jest.mock("jose", () => {
  class SignJWT {
    private p: Record<string, unknown>
    constructor(payload: Record<string, unknown>) {
      this.p = { ...payload }
    }
    setProtectedHeader(h: Record<string, unknown>) {
      this.p.__alg = h.alg
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
    setExpirationTime(ttl: string) {
      this.p.__ttl = ttl
      this.p.exp = 9_999_999_999
      return this
    }
    async sign(key: unknown) {
      if (!key) throw new Error("no key")
      return "mock." + Buffer.from(JSON.stringify(this.p)).toString("base64")
    }
  }
  async function jwtVerify(
    token: string,
    _key: unknown,
    opts?: { issuer?: string; audience?: string }
  ) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(
        Buffer.from(String(token).replace(/^mock\./, ""), "base64").toString("utf8")
      )
    } catch {
      throw new Error("bad token")
    }
    if (typeof payload !== "object" || payload === null) throw new Error("bad token")
    if (opts?.issuer && payload.iss !== opts.issuer) throw new Error("bad iss")
    if (opts?.audience && payload.aud !== opts.audience) throw new Error("bad aud")
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      throw new Error("expired")
    }
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

import {
  bearerFrom,
  issueTokens,
  requireApiUser,
  signAccessToken,
  verifyRefreshToken,
} from "@/lib/apiAuth"
import { ApiError } from "@/lib/apiResponse"

const SECRET = "test-secret-value-at-least-32-characters-long"
process.env.NEXTAUTH_SECRET = SECRET

/** Build a token the stubbed verifier accepts, with an arbitrary payload. */
const mockToken = (payload: Record<string, unknown>) =>
  "mock." + Buffer.from(JSON.stringify(payload)).toString("base64")

const decode = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.replace(/^mock\./, ""), "base64").toString("utf8"))

/** A Request whose Authorization header is only readable under the given casing. */
function reqWithHeaderCasing(casing: string, value: string): Request {
  return {
    headers: { get: (k: string) => (k === casing ? value : null) },
  } as unknown as Request
}

function reqWith(authHeader?: string): Request {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "authorization" ? (authHeader ?? null) : null),
    },
  } as unknown as Request
}

describe("bearerFrom header parsing", () => {
  it("accepts any casing of the scheme keyword", () => {
    expect(bearerFrom(reqWith("BEARER abc"))).toBe("abc")
    expect(bearerFrom(reqWith("bEaReR abc"))).toBe("abc")
  })

  it("tolerates surrounding whitespace and a tab separator", () => {
    expect(bearerFrom(reqWith("   Bearer abc   "))).toBe("abc")
    expect(bearerFrom(reqWith("Bearer\tabc"))).toBe("abc")
  })

  it("rejects a scheme with no token after it", () => {
    expect(bearerFrom(reqWith("Bearer"))).toBeNull()
    expect(bearerFrom(reqWith("Bearer   "))).toBeNull()
    expect(bearerFrom(reqWith(""))).toBeNull()
  })

  it("rejects headers that merely contain or resemble the scheme", () => {
    expect(bearerFrom(reqWith("Bearerabc"))).toBeNull()
    expect(bearerFrom(reqWith("XBearer abc"))).toBeNull()
    expect(bearerFrom(reqWith("Token abc"))).toBeNull()
    expect(bearerFrom(reqWith("Basic dXNlcjpwYXNz"))).toBeNull()
  })

  it("falls back to the capitalised header name when the lookup is case-sensitive", () => {
    // Real `Headers` is case-insensitive; this covers the explicit fallback in
    // bearerFrom for callers that pass a plainer request-like object.
    expect(bearerFrom(reqWithHeaderCasing("Authorization", "Bearer abc"))).toBe("abc")
    expect(bearerFrom(reqWithHeaderCasing("authorization", "Bearer abc"))).toBe("abc")
  })
})

describe("requireApiUser token payload validation", () => {
  it("rejects a correctly-audienced token that carries no subject", async () => {
    const token = mockToken({ iss: "focusflow", aud: "focusflow-mobile", exp: 9_999_999_999 })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toBeInstanceOf(ApiError)
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({ status: 401 })
  })

  it("rejects a token whose subject is not a string", async () => {
    const token = mockToken({
      sub: 42,
      iss: "focusflow",
      aud: "focusflow-mobile",
      exp: 9_999_999_999,
    })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({ status: 401 })
  })

  it("rejects an expired access token", async () => {
    const token = mockToken({
      sub: "u1",
      iss: "focusflow",
      aud: "focusflow-mobile",
      exp: 1_000, // 1970
    })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({ status: 401 })
  })

  it("rejects a token minted by a different issuer", async () => {
    const token = mockToken({
      sub: "u1",
      iss: "someone-else",
      aud: "focusflow-mobile",
      exp: 9_999_999_999,
    })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({ status: 401 })
  })

  it("never echoes the offending token back in the error message", async () => {
    const token = mockToken({ iss: "focusflow", aud: "focusflow-mobile", exp: 9_999_999_999 })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({
      message: "Invalid or expired token",
    })
  })

  it("verifyRefreshToken rejects an expired refresh token with its own message", async () => {
    const token = mockToken({
      sub: "u1",
      iss: "focusflow",
      aud: "focusflow-mobile-refresh",
      exp: 1_000,
    })
    await expect(verifyRefreshToken(token)).rejects.toMatchObject({
      status: 401,
      message: "Invalid or expired refresh token",
    })
  })

  it("verifyRefreshToken rejects an empty string token", async () => {
    await expect(verifyRefreshToken("")).rejects.toMatchObject({ status: 401 })
  })
})

describe("issueTokens wire contract", () => {
  it("signs both tokens for the same subject with the documented issuer/audiences", async () => {
    const { accessToken, refreshToken } = await issueTokens("user-77")
    const access = decode(accessToken)
    const refresh = decode(refreshToken)
    expect(access).toMatchObject({ sub: "user-77", iss: "focusflow", aud: "focusflow-mobile" })
    expect(refresh).toMatchObject({
      sub: "user-77",
      iss: "focusflow",
      aud: "focusflow-mobile-refresh",
    })
    expect(access.__alg).toBe("HS256")
  })

  it("advertises expiresIn as 30 days of seconds, matching the access TTL", async () => {
    const tokens = await issueTokens("user-77")
    expect(tokens.expiresIn).toBe(30 * 24 * 60 * 60)
    expect(decode(tokens.accessToken).__ttl).toBe("30d")
    expect(decode(tokens.refreshToken).__ttl).toBe("90d")
  })
})

describe("missing signing secret", () => {
  const saved = {
    nextauth: process.env.NEXTAUTH_SECRET,
    auth: process.env.AUTH_SECRET,
  }

  beforeEach(() => {
    delete process.env.NEXTAUTH_SECRET
    delete process.env.AUTH_SECRET
  })

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = saved.nextauth ?? SECRET
    if (saved.auth === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = saved.auth
  })

  it("signing fails loudly rather than minting an unsigned token", async () => {
    await expect(signAccessToken("u1")).rejects.toThrow(/NEXTAUTH_SECRET/)
  })

  it("AUTH_SECRET is accepted as a fallback for the signing key", async () => {
    process.env.AUTH_SECRET = SECRET
    await expect(signAccessToken("u1")).resolves.toEqual(expect.stringContaining("mock."))
  })

  it("verification reports a 401 rather than a 500 when the server is misconfigured", async () => {
    // Current behaviour: requireApiUser catches EVERYTHING from verify(), so a
    // missing secret looks to the client like a bad token. See suspectedDefects.
    const token = mockToken({
      sub: "u1",
      iss: "focusflow",
      aud: "focusflow-mobile",
      exp: 9_999_999_999,
    })
    await expect(requireApiUser(reqWith(`Bearer ${token}`))).rejects.toMatchObject({ status: 401 })
  })
})
