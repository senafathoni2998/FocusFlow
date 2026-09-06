/**
 * @jest-environment node
 *
 * ALLOW_SIGNUP=false closes BOTH doors that create accounts — the web form's
 * route and the mobile register endpoint — with the same status and the same
 * message. One policy, two entry points; a gate on one and not the other
 * protects nothing.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      headers: new Map(),
    }),
  },
}))
jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("hashed") }))
jest.mock("@/lib/services/authService", () => ({ registerUser: jest.fn() }))

import { POST as WEB_SIGNUP } from "@/app/api/auth/signup/route"
import { POST as V1_REGISTER } from "@/app/api/v1/auth/register/route"
import { registerUser } from "@/lib/services/authService"
import { resetRateLimits } from "@/lib/rateLimit"
import { SIGNUP_CLOSED_MESSAGE } from "@/lib/signupPolicy"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyOf = (res: any) => res.body as Record<string, unknown>

const request = (url: string) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ email: "new@example.com", password: "secret123" }),
  })

const ORIGINAL = process.env.ALLOW_SIGNUP

beforeEach(() => {
  jest.clearAllMocks()
  resetRateLimits()
  prisma.user.findFirst.mockResolvedValue(null)
  prisma.user.create.mockResolvedValue({ id: "u1", email: "new@example.com", name: null })
  ;(registerUser as jest.Mock).mockResolvedValue({
    accessToken: "a",
    refreshToken: "r",
    user: { id: "u1", email: "new@example.com" },
  })
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOW_SIGNUP
  else process.env.ALLOW_SIGNUP = ORIGINAL
})

describe("with ALLOW_SIGNUP=false", () => {
  beforeEach(() => {
    process.env.ALLOW_SIGNUP = "false"
  })

  it("the web form's route answers 403 and creates nothing", async () => {
    const res = await WEB_SIGNUP(request("http://localhost/api/auth/signup"))
    expect(res.status).toBe(403)
    expect(bodyOf(res).error).toBe(SIGNUP_CLOSED_MESSAGE)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("the mobile register endpoint answers the SAME 403 and never reaches the service", async () => {
    const res = await V1_REGISTER(request("http://localhost/api/v1/auth/register"), ctx)
    expect(res.status).toBe(403)
    expect(bodyOf(res).error).toBe(SIGNUP_CLOSED_MESSAGE)
    expect(registerUser).not.toHaveBeenCalled()
  })

  it("is checked BEFORE the rate limit, so a closed door never turns into a 429", async () => {
    // Twenty tries from one IP would trip the register limit if the gate sat
    // behind it. The answer to "can I register" does not depend on how often
    // you ask.
    for (let i = 0; i < 20; i++) {
      const res = await WEB_SIGNUP(request("http://localhost/api/auth/signup"))
      expect(res.status).toBe(403)
    }
  })
})

describe("with ALLOW_SIGNUP unset", () => {
  beforeEach(() => {
    delete process.env.ALLOW_SIGNUP
  })

  it("both doors work exactly as before", async () => {
    const web = await WEB_SIGNUP(request("http://localhost/api/auth/signup"))
    expect(web.status).toBe(201)
    expect(prisma.user.create).toHaveBeenCalledTimes(1)

    const v1 = await V1_REGISTER(request("http://localhost/api/v1/auth/register"), ctx)
    expect(v1.status).toBe(201)
    expect(registerUser).toHaveBeenCalledTimes(1)
  })
})
