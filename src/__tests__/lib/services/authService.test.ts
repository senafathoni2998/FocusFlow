/**
 * @jest-environment node
 *
 * authService: register / login / refresh. Prisma is the global mock; `jose` is
 * stubbed (ESM-only build Jest can't parse) with an issuer/audience-enforcing fake
 * so token issuance works without real crypto. bcrypt hashing/compare is real.
 */
jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
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
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

import { hash } from "bcryptjs"
import { registerUser, loginUser, refreshTokens } from "@/lib/services/authService"
import { signRefreshToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

beforeEach(() => {
  jest.clearAllMocks()
})

describe("authService.registerUser", () => {
  it("creates a user and returns a token pair", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue({ id: "u1", email: "a@b.com", name: "A" })

    const res = await registerUser({ email: "a@b.com", password: "secret123", name: "A" })

    expect(prisma.user.create).toHaveBeenCalled()
    expect(res.user).toEqual({ id: "u1", email: "a@b.com", name: "A" })
    expect(typeof res.accessToken).toBe("string")
    expect(typeof res.refreshToken).toBe("string")
  })

  it("rejects a duplicate email with 409", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "existing" })
    await expect(registerUser({ email: "a@b.com", password: "secret123" })).rejects.toMatchObject({
      status: 409,
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("rejects an invalid email (validation)", async () => {
    await expect(registerUser({ email: "nope", password: "secret123" })).rejects.toBeDefined()
  })

  it("rejects a too-short password", async () => {
    await expect(registerUser({ email: "a@b.com", password: "123" })).rejects.toBeDefined()
  })
})

describe("authService.loginUser", () => {
  it("returns tokens for correct credentials", async () => {
    const hashed = await hash("secret123", 10)
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", name: "A", password: hashed })

    const res = await loginUser({ email: "a@b.com", password: "secret123" })
    expect(res.user.id).toBe("u1")
    expect(typeof res.accessToken).toBe("string")
  })

  it("rejects a wrong password with 401", async () => {
    const hashed = await hash("secret123", 10)
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", name: "A", password: hashed })

    await expect(loginUser({ email: "a@b.com", password: "wrong" })).rejects.toMatchObject({
      status: 401,
    })
  })

  it("rejects an unknown email with 401 (no user enumeration)", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(loginUser({ email: "ghost@b.com", password: "secret123" })).rejects.toMatchObject({
      status: 401,
    })
  })
})

describe("authService.refreshTokens", () => {
  it("issues a fresh pair for a valid refresh token", async () => {
    const refreshToken = await signRefreshToken("u5")
    prisma.user.findUnique.mockResolvedValue({ id: "u5", email: "e@e.com", name: null })

    const res = await refreshTokens({ refreshToken })
    expect(res.user.id).toBe("u5")
    expect(typeof res.accessToken).toBe("string")
  })

  it("rejects a missing refresh token with 400", async () => {
    await expect(refreshTokens({})).rejects.toMatchObject({ status: 400 })
  })

  it("rejects when the user no longer exists", async () => {
    const refreshToken = await signRefreshToken("gone")
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(refreshTokens({ refreshToken })).rejects.toMatchObject({ status: 401 })
  })
})
