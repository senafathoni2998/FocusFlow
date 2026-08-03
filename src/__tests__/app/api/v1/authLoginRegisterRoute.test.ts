/**
 * @jest-environment node
 *
 * Route-level tests for POST /api/v1/auth/login and /api/v1/auth/register.
 *
 * These two routes are thin, but the thing they own — brute-force throttling —
 * lives nowhere else, so it is tested here. authService is mocked (it has its own
 * unit tests, and real bcrypt would make an 11-attempt burst needlessly slow);
 * `@/lib/rateLimit` is deliberately NOT mocked, because the limiter IS the
 * behaviour under test. Its buckets are module-scoped, hence resetRateLimits()
 * in beforeEach. next/server's NextResponse.json is stubbed to a plain object
 * that still carries real Headers, so the Retry-After header is observable.
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

jest.mock("@/lib/services/authService", () => ({
  loginUser: jest.fn(),
  registerUser: jest.fn(),
}))

import { POST as LOGIN } from "@/app/api/v1/auth/login/route"
import { POST as REGISTER } from "@/app/api/v1/auth/register/route"
import { loginUser, registerUser } from "@/lib/services/authService"
import { resetRateLimits, LOGIN_LIMIT, REGISTER_LIMIT } from "@/lib/rateLimit"
import { ApiError } from "@/lib/apiResponse"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any

/** A Request just rich enough for clientKey() + readJson(). */
function req(opts: { ip?: string; body?: unknown; malformed?: boolean } = {}): Request {
  const headers = new Map<string, string>()
  if (opts.ip) headers.set("x-forwarded-for", opts.ip)
  return {
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => {
      if (opts.malformed) throw new SyntaxError("Unexpected token < in JSON")
      return opts.body
    },
  } as unknown as Request
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bodyOf = (res: any) => res.body as Record<string, unknown>

const TOKENS = {
  user: { id: "u1", email: "sena@gmail.com", name: "Sena" },
  accessToken: "access.jwt",
  refreshToken: "refresh.jwt",
  tokenType: "Bearer" as const,
  expiresIn: 2_592_000,
}

beforeEach(() => {
  jest.clearAllMocks()
  resetRateLimits()
})

describe("POST /api/v1/auth/login", () => {
  it("returns 200 with the token pair and forwards the raw body to the service", async () => {
    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)

    const res = await LOGIN(req({ ip: "1.1.1.1", body: { email: "sena@gmail.com", password: "secret123" } }), ctx)

    expect(res.status).toBe(200)
    expect(bodyOf(res)).toEqual(TOKENS)
    // The route must not pre-validate or reshape credentials — the service owns
    // the schema, so it has to receive exactly what the client sent.
    expect(loginUser).toHaveBeenCalledWith({ email: "sena@gmail.com", password: "secret123" })
  })

  it("surfaces the service's 401 as a JSON error envelope, not a 500", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))

    const res = await LOGIN(req({ ip: "1.1.1.1", body: { email: "sena@gmail.com", password: "nope" } }), ctx)

    expect(res.status).toBe(401)
    expect(bodyOf(res)).toEqual({ error: "Invalid email or password" })
  })

  it("returns 400 on a malformed JSON body without calling the service", async () => {
    const res = await LOGIN(req({ ip: "1.1.1.1", malformed: true }), ctx)

    expect(res.status).toBe(400)
    expect(bodyOf(res).error).toBe("Malformed JSON body")
    expect(loginUser).not.toHaveBeenCalled()
  })

  it("throttles one IP grinding through many different accounts", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))

    // Every attempt targets a DIFFERENT account, so only the per-IP bucket can catch it.
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      const res = await LOGIN(req({ ip: "9.9.9.9", body: { email: `victim${i}@x.com`, password: "guess" } }), ctx)
      expect(res.status).toBe(401)
    }
    expect(loginUser).toHaveBeenCalledTimes(LOGIN_LIMIT.limit)

    const blocked = await LOGIN(req({ ip: "9.9.9.9", body: { email: "victim99@x.com", password: "guess" } }), ctx)

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/)
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
    // Blocked before bcrypt runs — otherwise throttling wouldn't save any work.
    expect(loginUser).toHaveBeenCalledTimes(LOGIN_LIMIT.limit)
  })

  it("throttles a distributed guessing run against ONE account, which the IP bucket alone would miss", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))

    // A fresh IP each time: every per-IP bucket sees exactly one request.
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      const res = await LOGIN(req({ ip: `10.0.0.${i}`, body: { email: "target@x.com", password: "guess" } }), ctx)
      expect(res.status).toBe(401)
    }

    const blocked = await LOGIN(req({ ip: "10.0.1.1", body: { email: "target@x.com", password: "guess" } }), ctx)

    expect(blocked.status).toBe(429)
    expect(loginUser).toHaveBeenCalledTimes(LOGIN_LIMIT.limit)
  })

  it("keys the per-account bucket on the normalized email, so case variants can't buy extra attempts", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))

    const casings = ["Target@X.com", "TARGET@x.COM", " target@x.com ", "tArGeT@X.CoM", "target@x.com"]
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      await LOGIN(req({ ip: `10.1.0.${i}`, body: { email: casings[i % casings.length], password: "guess" } }), ctx)
    }

    const blocked = await LOGIN(req({ ip: "10.1.9.9", body: { email: "TARGET@X.COM", password: "guess" } }), ctx)
    expect(blocked.status).toBe(429)
  })

  it("does not consume the per-account bucket when no usable email was supplied", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(400, "Invalid input"))

    // Non-string / empty emails are skipped by the account bucket, so they can only
    // ever exhaust the per-IP one. Spread across IPs, they cost nothing.
    for (let i = 0; i < LOGIN_LIMIT.limit * 2; i++) {
      const res = await LOGIN(req({ ip: `10.2.0.${i}`, body: { email: i % 2 ? "" : 12345, password: "x" } }), ctx)
      expect(res.status).toBe(400)
    }

    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)
    const res = await LOGIN(req({ ip: "10.2.9.9", body: { email: "sena@gmail.com", password: "secret123" } }), ctx)
    expect(res.status).toBe(200)
  })

  it("never throttles an account on its own successful logins", async () => {
    // The per-account bucket counts FAILURES only and is cleared on success.
    // Charging it up front made it an account-lockout weapon: anyone who knew the
    // address could spend the quota from arbitrary IPs and leave the real owner
    // facing 429 with the correct password.
    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)

    for (let i = 0; i < LOGIN_LIMIT.limit * 2; i++) {
      const res = await LOGIN(
        req({ ip: `10.3.0.${i}`, body: { email: "sena@gmail.com", password: "secret123" } }),
        ctx,
      )
      expect(res.status).toBe(200)
    }
  })

  it("a stranger's failed guesses cannot lock the owner out once they succeed", async () => {
    // Nine wrong guesses (one short of the limit), then the owner's correct
    // password gets through AND resets the counter.
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))
    for (let i = 0; i < LOGIN_LIMIT.limit - 1; i++) {
      await LOGIN(req({ ip: `10.4.0.${i}`, body: { email: "sena@gmail.com", password: "guess" } }), ctx)
    }

    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)
    const owner = await LOGIN(
      req({ ip: "10.4.9.9", body: { email: "sena@gmail.com", password: "secret123" } }),
      ctx,
    )
    expect(owner.status).toBe(200)

    // Counter cleared, so the next wrong guesses start from zero again.
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))
    const afterReset = await LOGIN(
      req({ ip: "10.4.9.8", body: { email: "sena@gmail.com", password: "guess" } }),
      ctx,
    )
    expect(afterReset.status).toBe(401)
  })

  it("still throttles sustained failures against one account across many IPs", async () => {
    // The whole point of the per-account bucket: an IP bucket alone would miss a
    // distributed guessing run because each source gets its own allowance.
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))

    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      const res = await LOGIN(
        req({ ip: `10.5.0.${i}`, body: { email: "sena@gmail.com", password: "guess" } }),
        ctx,
      )
      expect(res.status).toBe(401)
    }

    const blocked = await LOGIN(
      req({ ip: "10.5.9.9", body: { email: "sena@gmail.com", password: "guess" } }),
      ctx,
    )
    expect(blocked.status).toBe(429)
  })

  it("gives an unrelated IP and account their own buckets", async () => {
    ;(loginUser as jest.Mock).mockRejectedValue(new ApiError(401, "Invalid email or password"))
    for (let i = 0; i < LOGIN_LIMIT.limit + 5; i++) {
      await LOGIN(req({ ip: "7.7.7.7", body: { email: "noisy@x.com", password: "guess" } }), ctx)
    }

    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)
    const res = await LOGIN(req({ ip: "8.8.8.8", body: { email: "quiet@x.com", password: "secret123" } }), ctx)

    expect(res.status).toBe(200)
  })
})

describe("POST /api/v1/auth/register", () => {
  it("returns 201 with the new user and token pair", async () => {
    ;(registerUser as jest.Mock).mockResolvedValue(TOKENS)

    const res = await REGISTER(
      req({ ip: "2.2.2.2", body: { email: "new@x.com", password: "secret123", name: "New" } }),
      ctx,
    )

    expect(res.status).toBe(201)
    expect(bodyOf(res)).toEqual(TOKENS)
    expect(registerUser).toHaveBeenCalledWith({ email: "new@x.com", password: "secret123", name: "New" })
  })

  it("surfaces a duplicate-email 409 from the service", async () => {
    ;(registerUser as jest.Mock).mockRejectedValue(new ApiError(409, "A user with that email already exists"))

    const res = await REGISTER(req({ ip: "2.2.2.2", body: { email: "taken@x.com", password: "secret123" } }), ctx)

    expect(res.status).toBe(409)
    expect(bodyOf(res)).toEqual({ error: "A user with that email already exists" })
  })

  it("returns 400 with Zod details when the service rejects the input", async () => {
    const zodish = new ApiError(400, "Invalid input", [{ path: ["password"], message: "Too small" }])
    ;(registerUser as jest.Mock).mockRejectedValue(zodish)

    const res = await REGISTER(req({ ip: "2.2.2.2", body: { email: "a@b.com", password: "123" } }), ctx)

    expect(res.status).toBe(400)
    expect(bodyOf(res)).toEqual({
      error: "Invalid input",
      details: [{ path: ["password"], message: "Too small" }],
    })
  })

  it("caps account creation per IP and answers 429 with Retry-After", async () => {
    ;(registerUser as jest.Mock).mockResolvedValue(TOKENS)

    for (let i = 0; i < REGISTER_LIMIT.limit; i++) {
      const res = await REGISTER(req({ ip: "3.3.3.3", body: { email: `spam${i}@x.com`, password: "secret123" } }), ctx)
      expect(res.status).toBe(201)
    }

    const blocked = await REGISTER(req({ ip: "3.3.3.3", body: { email: "spam99@x.com", password: "secret123" } }), ctx)

    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ error: "Too many attempts. Try again later." })
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(registerUser).toHaveBeenCalledTimes(REGISTER_LIMIT.limit)
  })

  it("throttles before parsing the body, so junk requests still cost the caller quota", async () => {
    for (let i = 0; i < REGISTER_LIMIT.limit; i++) {
      const res = await REGISTER(req({ ip: "4.4.4.4", malformed: true }), ctx)
      expect(res.status).toBe(400)
    }

    const blocked = await REGISTER(req({ ip: "4.4.4.4", body: { email: "a@b.com", password: "secret123" } }), ctx)
    expect(blocked.status).toBe(429)
    expect(registerUser).not.toHaveBeenCalled()
  })

  it("falls back to x-real-ip, and lumps header-less callers into one shared bucket", async () => {
    ;(registerUser as jest.Mock).mockResolvedValue(TOKENS)

    const withRealIp = {
      headers: { get: (k: string) => (k.toLowerCase() === "x-real-ip" ? "5.5.5.5" : null) },
      json: async () => ({ email: "a@x.com", password: "secret123" }),
    } as unknown as Request
    const anonymous = {
      headers: { get: () => null },
      json: async () => ({ email: "b@x.com", password: "secret123" }),
    } as unknown as Request

    // Exhaust the "unknown" bucket with header-less requests...
    for (let i = 0; i < REGISTER_LIMIT.limit; i++) {
      expect((await REGISTER(anonymous, ctx)).status).toBe(201)
    }
    expect((await REGISTER(anonymous, ctx)).status).toBe(429)

    // ...and a caller identified by x-real-ip is unaffected by it.
    expect((await REGISTER(withRealIp, ctx)).status).toBe(201)
  })

  it("separates login and register quotas even for the same IP", async () => {
    ;(registerUser as jest.Mock).mockResolvedValue(TOKENS)
    ;(loginUser as jest.Mock).mockResolvedValue(TOKENS)

    for (let i = 0; i < REGISTER_LIMIT.limit + 1; i++) {
      await REGISTER(req({ ip: "6.6.6.6", body: { email: `s${i}@x.com`, password: "secret123" } }), ctx)
    }

    const res = await LOGIN(req({ ip: "6.6.6.6", body: { email: "sena@gmail.com", password: "secret123" } }), ctx)
    expect(res.status).toBe(200)
  })
})
