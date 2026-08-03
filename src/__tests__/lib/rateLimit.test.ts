/**
 * @jest-environment node
 */
import {
  rateLimit,
  resetRateLimits,
  clientKey,
  LOGIN_LIMIT,
} from "@/lib/rateLimit"

beforeEach(() => resetRateLimits())

const WINDOW = { limit: 3, windowMs: 60_000 }

describe("rateLimit", () => {
  it("allows up to the limit and then blocks", () => {
    const t = 1_000_000
    expect(rateLimit("k", WINDOW, t).allowed).toBe(true)
    expect(rateLimit("k", WINDOW, t).allowed).toBe(true)
    expect(rateLimit("k", WINDOW, t).allowed).toBe(true)

    const blocked = rateLimit("k", WINDOW, t)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it("reports whole seconds until the window resets", () => {
    const t = 1_000_000
    for (let i = 0; i < WINDOW.limit; i++) rateLimit("k", WINDOW, t)

    // 10s into a 60s window -> 50s left.
    const blocked = rateLimit("k", WINDOW, t + 10_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(50)
  })

  it("never advertises a zero retry-after", () => {
    const t = 1_000_000
    for (let i = 0; i < WINDOW.limit; i++) rateLimit("k", WINDOW, t)
    // 1ms before the reset still has to say "wait at least a second".
    expect(rateLimit("k", WINDOW, t + WINDOW.windowMs - 1).retryAfter).toBe(1)
  })

  it("starts a fresh window once the old one expires", () => {
    const t = 1_000_000
    for (let i = 0; i < WINDOW.limit; i++) rateLimit("k", WINDOW, t)
    expect(rateLimit("k", WINDOW, t).allowed).toBe(false)

    const after = rateLimit("k", WINDOW, t + WINDOW.windowMs)
    expect(after.allowed).toBe(true)
    expect(after.remaining).toBe(WINDOW.limit - 1)
  })

  it("keys are independent, so one client cannot lock out another", () => {
    const t = 1_000_000
    for (let i = 0; i < WINDOW.limit; i++) rateLimit("a", WINDOW, t)
    expect(rateLimit("a", WINDOW, t).allowed).toBe(false)
    expect(rateLimit("b", WINDOW, t).allowed).toBe(true)
  })

  it("counts down the remaining allowance", () => {
    const t = 1_000_000
    expect(rateLimit("k", WINDOW, t).remaining).toBe(2)
    expect(rateLimit("k", WINDOW, t).remaining).toBe(1)
    expect(rateLimit("k", WINDOW, t).remaining).toBe(0)
  })

  it("login allowance is generous enough for a human fumbling a password", () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("login", LOGIN_LIMIT, t).allowed).toBe(true)
    }
  })
})

describe("clientKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api", { headers })

  it("uses the first hop of x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7")
  })

  it("falls back to x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4")
  })

  it("degrades to a shared bucket when neither header is present", () => {
    expect(clientKey(req({}))).toBe("unknown")
  })
})
