/**
 * @jest-environment node
 *
 * Route-level integration for /api/v1/lists and /api/v1/lists/[id]. Proves the
 * auth gate, the token->userId scoping, the JSON envelope/status codes and the
 * error mapping done by handleRoute. listService is mocked (unit-tested
 * separately); `jose` is stubbed because it is ESM-only; next/server's
 * NextResponse.json is stubbed to a readable plain object.
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

jest.mock("@/lib/services/listService", () => ({
  getLists: jest.fn(),
  createList: jest.fn(),
  updateList: jest.fn(),
  deleteList: jest.fn(),
}))

import { z } from "zod"
import { GET, POST } from "@/app/api/v1/lists/route"
import { PATCH, DELETE } from "@/app/api/v1/lists/[id]/route"
import { getLists, createList, updateList, deleteList } from "@/lib/services/listService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"
import { notFound } from "@/lib/apiResponse"

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

/** A request whose body cannot be parsed — exercises readJson's 400 mapping. */
function badBodyReq(authHeader: string): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader : null) },
    json: async () => {
      throw new SyntaxError("Unexpected token")
    },
  } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/lists", () => {
  it("returns 401 without a bearer token and never touches the service", async () => {
    const res = await GET(req(undefined), collectionCtx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(getLists).not.toHaveBeenCalled()
  })

  it("returns 200 + { lists } scoped to the token's subject", async () => {
    ;(getLists as jest.Mock).mockResolvedValue([{ id: "l1", name: "Work" }])
    const res = await GET(req(`Bearer ${await signAccessToken("u1")}`), collectionCtx)
    expect(res.status).toBe(200)
    expect((res.body as { lists: unknown[] }).lists).toEqual([{ id: "l1", name: "Work" }])
    expect(getLists).toHaveBeenCalledWith("u1")
  })

  it("rejects a refresh token — only the access audience opens this door", async () => {
    const res = await GET(req(`Bearer ${await signRefreshToken("u1")}`), collectionCtx)
    expect(res.status).toBe(401)
    expect(getLists).not.toHaveBeenCalled()
  })

  it("rejects a garbage Authorization header that isn't a Bearer scheme", async () => {
    const res = await GET(req("Basic dXNlcjpwYXNz"), collectionCtx)
    expect(res.status).toBe(401)
    expect(getLists).not.toHaveBeenCalled()
  })
})

describe("POST /api/v1/lists", () => {
  it("creates a list as 201 { list }, forwarding the body unchanged", async () => {
    ;(createList as jest.Mock).mockResolvedValue({ id: "l2", name: "Home" })
    const res = await POST(req(`Bearer ${await signAccessToken("u9")}`, { name: "Home" }), collectionCtx)
    expect(res.status).toBe(201)
    expect((res.body as { list: { id: string } }).list.id).toBe("l2")
    expect(createList).toHaveBeenCalledWith("u9", { name: "Home" })
  })

  it("401s an unauthenticated create before reading the body", async () => {
    const res = await POST(req(undefined, { name: "Home" }), collectionCtx)
    expect(res.status).toBe(401)
    expect(createList).not.toHaveBeenCalled()
  })

  it("maps a malformed JSON body to 400", async () => {
    const res = await POST(badBodyReq(`Bearer ${await signAccessToken("u1")}`), collectionCtx)
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/malformed json/i)
    expect(createList).not.toHaveBeenCalled()
  })

  it("turns a service-thrown ZodError into 400 Invalid input with details", async () => {
    let zodError: unknown
    try {
      z.object({ name: z.string().min(1) }).parse({ name: "" })
    } catch (e) {
      zodError = e
    }
    ;(createList as jest.Mock).mockRejectedValue(zodError)
    const res = await POST(req(`Bearer ${await signAccessToken("u1")}`, { name: "" }), collectionCtx)
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe("Invalid input")
    expect((res.body as { details: unknown[] }).details).toHaveLength(1)
  })

  it("hides an unexpected service failure behind a generic 500", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    ;(createList as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED 5432"))
    const res = await POST(req(`Bearer ${await signAccessToken("u1")}`, { name: "x" }), collectionCtx)
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe("Internal server error")
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED/)
    spy.mockRestore()
  })
})

describe("PATCH /api/v1/lists/[id]", () => {
  it("passes the token's user, the route id and the body to updateList", async () => {
    ;(updateList as jest.Mock).mockResolvedValue({ id: "l1", name: "Renamed" })
    const res = await PATCH(
      req(`Bearer ${await signAccessToken("u1")}`, { name: "Renamed" }),
      itemCtx("l1")
    )
    expect(res.status).toBe(200)
    expect((res.body as { list: { name: string } }).list.name).toBe("Renamed")
    expect(updateList).toHaveBeenCalledWith("u1", "l1", { name: "Renamed" })
  })

  it("401s without a token — an unauthenticated PATCH must not reach the service", async () => {
    const res = await PATCH(req(undefined, { name: "Renamed" }), itemCtx("l1"))
    expect(res.status).toBe(401)
    expect(updateList).not.toHaveBeenCalled()
  })

  it("surfaces the service's 404 for a list owned by someone else", async () => {
    ;(updateList as jest.Mock).mockRejectedValue(notFound("List not found"))
    const res = await PATCH(
      req(`Bearer ${await signAccessToken("attacker")}`, { name: "pwn" }),
      itemCtx("victim-list")
    )
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("List not found")
  })
})

describe("DELETE /api/v1/lists/[id]", () => {
  it("returns the service result envelope verbatim on success", async () => {
    ;(deleteList as jest.Mock).mockResolvedValue({ success: true })
    const res = await DELETE(req(`Bearer ${await signAccessToken("u1")}`), itemCtx("l1"))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(deleteList).toHaveBeenCalledWith("u1", "l1")
  })

  it("401s without a token and never deletes", async () => {
    const res = await DELETE(req(undefined), itemCtx("l1"))
    expect(res.status).toBe(401)
    expect(deleteList).not.toHaveBeenCalled()
  })
})
