/**
 * @jest-environment node
 *
 * Route-level integration for /api/v1/tasks: proves the handleRoute wrapper +
 * requireApiUser plumbing + JSON envelope work end to end. The task service is
 * mocked (its logic is unit-tested separately); `jose` is stubbed; next/server's
 * NextResponse.json is stubbed to a readable object.
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

jest.mock("@/lib/services/taskService", () => ({
  listTasks: jest.fn(),
  createTask: jest.fn(),
}))

import { GET, POST } from "@/app/api/v1/tasks/route"
import { listTasks, createTask } from "@/lib/services/taskService"
import { signAccessToken } from "@/lib/apiAuth"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any

function req(authHeader: string | undefined, body?: unknown): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null) },
    json: async () => body,
  } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe("GET /api/v1/tasks", () => {
  it("returns 401 without a bearer token", async () => {
    const res = await GET(req(undefined), ctx)
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toMatch(/bearer/i)
    expect(listTasks).not.toHaveBeenCalled()
  })

  it("returns 200 + tasks for a valid token", async () => {
    ;(listTasks as jest.Mock).mockResolvedValue([{ id: "t1" }])
    const token = await signAccessToken("u1")
    const res = await GET(req(`Bearer ${token}`), ctx)
    expect(res.status).toBe(200)
    expect((res.body as { tasks: unknown[] }).tasks).toEqual([{ id: "t1" }])
    expect(listTasks).toHaveBeenCalledWith("u1")
  })
})

describe("POST /api/v1/tasks", () => {
  it("creates a task (201) for a valid token, passing the body through", async () => {
    ;(createTask as jest.Mock).mockResolvedValue({ id: "t2", title: "Hi" })
    const token = await signAccessToken("u9")
    const res = await POST(req(`Bearer ${token}`, { title: "Hi" }), ctx)
    expect(res.status).toBe(201)
    expect((res.body as { task: { id: string } }).task.id).toBe("t2")
    expect(createTask).toHaveBeenCalledWith("u9", { title: "Hi" })
  })

  it("401s an unauthenticated create", async () => {
    const res = await POST(req(undefined, { title: "Hi" }), ctx)
    expect(res.status).toBe(401)
    expect(createTask).not.toHaveBeenCalled()
  })
})
