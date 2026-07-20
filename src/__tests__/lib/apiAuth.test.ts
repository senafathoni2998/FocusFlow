/**
 * @jest-environment node
 *
 * Bearer-token auth for the mobile API.
 *
 * `jose` ships an ESM-only build Jest can't parse, so it's mocked here with a
 * functional stub that still ENFORCES issuer + audience + expiry — the properties
 * this wrapper's security depends on. Real HS256 signing/verifying is exercised at
 * runtime (the running server / `next build`); these tests pin the wrapper logic:
 * bearer parsing, audience isolation between access/refresh, and 401 mapping.
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
  async function jwtVerify(
    token: string,
    _key: unknown,
    opts?: { issuer?: string; audience?: string }
  ) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(Buffer.from(String(token).replace(/^mock\./, ""), "base64").toString("utf8"))
    } catch {
      throw new Error("bad token")
    }
    if (opts?.issuer && payload.iss !== opts.issuer) throw new Error("bad iss")
    if (opts?.audience && payload.aud !== opts.audience) throw new Error("bad aud")
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) throw new Error("expired")
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  requireApiUser,
  bearerFrom,
  issueTokens,
} from "@/lib/apiAuth"
import { ApiError } from "@/lib/apiResponse"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

function reqWith(authHeader?: string): Request {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null),
    },
  } as unknown as Request
}

describe("apiAuth", () => {
  it("issueTokens returns an access+refresh pair with Bearer type", async () => {
    const tokens = await issueTokens("user-1")
    expect(tokens.tokenType).toBe("Bearer")
    expect(typeof tokens.accessToken).toBe("string")
    expect(typeof tokens.refreshToken).toBe("string")
    expect(tokens.accessToken).not.toEqual(tokens.refreshToken)
    expect(tokens.expiresIn).toBeGreaterThan(0)
  })

  it("requireApiUser accepts a valid access token and returns the subject", async () => {
    const token = await signAccessToken("user-42")
    expect(await requireApiUser(reqWith(`Bearer ${token}`))).toBe("user-42")
  })

  it("bearerFrom is case-insensitive on the scheme and trims", () => {
    expect(bearerFrom(reqWith("Bearer abc"))).toBe("abc")
    expect(bearerFrom(reqWith("bearer  xyz  "))).toBe("xyz")
    expect(bearerFrom(reqWith(undefined))).toBeNull()
    expect(bearerFrom(reqWith("Basic zzz"))).toBeNull()
  })

  it("requireApiUser throws 401 when the header is missing", async () => {
    await expect(requireApiUser(reqWith(undefined))).rejects.toBeInstanceOf(ApiError)
    await expect(requireApiUser(reqWith(undefined))).rejects.toMatchObject({ status: 401 })
  })

  it("requireApiUser throws 401 for a garbage token", async () => {
    await expect(requireApiUser(reqWith("Bearer not.a.jwt"))).rejects.toMatchObject({ status: 401 })
  })

  it("a refresh token is NOT accepted as an access token (audience isolation)", async () => {
    const refresh = await signRefreshToken("user-7")
    await expect(requireApiUser(reqWith(`Bearer ${refresh}`))).rejects.toMatchObject({ status: 401 })
  })

  it("an access token is NOT accepted as a refresh token", async () => {
    const access = await signAccessToken("user-7")
    await expect(verifyRefreshToken(access)).rejects.toMatchObject({ status: 401 })
  })

  it("verifyRefreshToken returns the subject for a valid refresh token", async () => {
    const refresh = await signRefreshToken("user-9")
    await expect(verifyRefreshToken(refresh)).resolves.toBe("user-9")
  })
})
