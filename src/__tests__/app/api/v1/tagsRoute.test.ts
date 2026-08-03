/**
 * @jest-environment node
 *
 * Route-level integration for /api/v1/tags and /api/v1/tags/[id]. Proves the auth
 * gate, token->userId scoping, the JSON envelope, and that the service's 409
 * duplicate-name conflict reaches the client as a 409 (not a 500). tagService is
 * mocked; `jose` is stubbed (ESM-only); NextResponse.json is stubbed to a plain
 * object.
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

jest.mock("@/lib/services/tagService", () => ({
  getTags: jest.fn(),
  updateTag: jest.fn(),
  deleteTag: jest.fn(),
}))

import { GET } from "@/app/api/v1/tags/route"
import { PATCH, DELETE } from "@/app/api/v1/tags/[id]/route"
import { getTags, updateTag, deleteTag } from "@/lib/services/tagService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"
import { ApiError, notFound } from "@/lib/apiResponse"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectionCtx = { params: Promise.resolve({}) } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const itemCtx = (id: string) => ({ params: Promise.resolve({ id }) }) as any

function req(authHeader: string | undefined, body?: unknown): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null) },
    json: async () => body,
  } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/tags", () => {
  it("returns 401 without a bearer token", async () => {
    const res = await GET(req(undefined), collectionCtx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(getTags).not.toHaveBeenCalled()
  })

  it("returns 200 + { tags } for the token's user only", async () => {
    ;(getTags as jest.Mock).mockResolvedValue([{ id: "g1", name: "work" }])
    const res = await GET(req(`Bearer ${await signAccessToken("u42")}`), collectionCtx)
    expect(res.status).toBe(200)
    expect((res.body as { tags: unknown[] }).tags).toEqual([{ id: "g1", name: "work" }])
    expect(getTags).toHaveBeenCalledWith("u42")
  })

  it("rejects a token forged with the refresh audience", async () => {
    const res = await GET(req(`Bearer ${await signRefreshToken("u42")}`), collectionCtx)
    expect(res.status).toBe(401)
    expect(getTags).not.toHaveBeenCalled()
  })

  it("rejects a structurally invalid token", async () => {
    const res = await GET(req("Bearer not-a-real-token"), collectionCtx)
    expect(res.status).toBe(401)
    expect(getTags).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/v1/tags/[id]", () => {
  it("renames an owned tag, returning 200 { tag }", async () => {
    ;(updateTag as jest.Mock).mockResolvedValue({ id: "g1", name: "deep work" })
    const res = await PATCH(
      req(`Bearer ${await signAccessToken("u1")}`, { name: "deep work" }),
      itemCtx("g1")
    )
    expect(res.status).toBe(200)
    expect((res.body as { tag: { name: string } }).tag.name).toBe("deep work")
    expect(updateTag).toHaveBeenCalledWith("u1", "g1", { name: "deep work" })
  })

  it("401s without a token and never reaches the service", async () => {
    const res = await PATCH(req(undefined, { name: "x" }), itemCtx("g1"))
    expect(res.status).toBe(401)
    expect(updateTag).not.toHaveBeenCalled()
  })

  it("returns 409 (not 500) when the rename collides with an existing tag name", async () => {
    ;(updateTag as jest.Mock).mockRejectedValue(
      new ApiError(409, "You already have a tag with that name")
    )
    const res = await PATCH(
      req(`Bearer ${await signAccessToken("u1")}`, { name: "work" }),
      itemCtx("g1")
    )
    expect(res.status).toBe(409)
    expect((res.body as { error: string }).error).toMatch(/already have a tag/i)
  })

  it("surfaces the service's 404 for another user's tag", async () => {
    ;(updateTag as jest.Mock).mockRejectedValue(notFound("Tag not found"))
    const res = await PATCH(
      req(`Bearer ${await signAccessToken("attacker")}`, { name: "pwn" }),
      itemCtx("victim-tag")
    )
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("Tag not found")
  })
})

describe("DELETE /api/v1/tags/[id]", () => {
  it("deletes an owned tag and returns the { success } envelope", async () => {
    ;(deleteTag as jest.Mock).mockResolvedValue({ success: true })
    const res = await DELETE(req(`Bearer ${await signAccessToken("u1")}`), itemCtx("g1"))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(deleteTag).toHaveBeenCalledWith("u1", "g1")
  })

  it("401s without a token and never deletes", async () => {
    const res = await DELETE(req(undefined), itemCtx("g1"))
    expect(res.status).toBe(401)
    expect(deleteTag).not.toHaveBeenCalled()
  })
})
