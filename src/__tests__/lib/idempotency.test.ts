/**
 * @jest-environment node
 *
 * Replay safety. The failure this exists to prevent has no good answer without
 * it: the request reached the server, the response never came back, and the
 * client cannot tell whether it worked. Every case below is one branch of that.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
      body,
      clone() {
        return this
      },
      async json() {
        return body
      },
    }),
  },
}))

import { withIdempotency, idempotencyKeyFrom } from "@/lib/idempotency"
import { NextResponse } from "next/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

const KEY = "b7f1c2d3-e4a5-4b6c-8d7e-9f0a1b2c3d4e"
const req = (key?: string) =>
  ({ headers: { get: (h: string) => (h === "idempotency-key" ? (key ?? null) : null) } }) as Request

const okResponse = () => NextResponse.json({ task: { id: "t1" } }, { status: 201 })

function conflict() {
  return Object.assign(new Error("unique"), { code: "P2002" })
}

beforeEach(() => {
  jest.resetAllMocks()
  prisma.idempotencyKey = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
})

describe("idempotencyKeyFrom", () => {
  it("is optional — a caller that does not opt in is unaffected", () => {
    expect(idempotencyKeyFrom(req())).toBeNull()
  })

  it("rejects a key too short to be unique per operation", () => {
    // "1" would collide with itself across unrelated requests, which is worse
    // than sending no key at all.
    expect(() => idempotencyKeyFrom(req("short"))).toThrow()
  })

  it("rejects an absurdly long key", () => {
    expect(() => idempotencyKeyFrom(req("x".repeat(201)))).toThrow()
  })
})

describe("withIdempotency", () => {
  it("passes straight through when no key is sent", async () => {
    const handler = jest.fn().mockResolvedValue(okResponse())

    await withIdempotency(req(), "u1", "tasks", { title: "a" }, handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled()
  })

  it("runs the handler once and stores the response for a first request", async () => {
    const handler = jest.fn().mockResolvedValue(okResponse())

    const res = await withIdempotency(req(KEY), "u1", "tasks", { title: "a" }, handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(201)
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "done", responseStatus: 201 }),
      }),
    )
  })

  it("replays the ORIGINAL response instead of running the handler again", async () => {
    // The whole point: a retry must not create a second task.
    prisma.idempotencyKey.create.mockRejectedValue(conflict())
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "done",
      requestHash: expect.anything(),
      responseStatus: 201,
      responseBody: { task: { id: "t1" } },
    })
    const handler = jest.fn()

    // Same body as the original, so the hashes match.
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "done",
      requestHash: require("crypto")
        .createHash("sha256")
        .update(JSON.stringify({ title: "a" }))
        .digest("hex"),
      responseStatus: 201,
      responseBody: { task: { id: "t1" } },
    })

    const res = await withIdempotency(req(KEY), "u1", "tasks", { title: "a" }, handler)

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ task: { id: "t1" } })
  })

  it("refuses the same key with a different body rather than answering the wrong question", async () => {
    prisma.idempotencyKey.create.mockRejectedValue(conflict())
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "done",
      requestHash: "a-hash-for-some-other-body",
      responseStatus: 201,
      responseBody: {},
    })

    await expect(
      withIdempotency(req(KEY), "u1", "tasks", { title: "different" }, jest.fn()),
    ).rejects.toMatchObject({ status: 422 })
  })

  it("tells a concurrent retry to wait instead of executing twice", async () => {
    // The outcome genuinely is not known yet; anything other than "wait" would
    // be a guess.
    prisma.idempotencyKey.create.mockRejectedValue(conflict())
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      status: "pending",
      requestHash: require("crypto")
        .createHash("sha256")
        .update(JSON.stringify({ title: "a" }))
        .digest("hex"),
    })
    const handler = jest.fn()

    await expect(
      withIdempotency(req(KEY), "u1", "tasks", { title: "a" }, handler),
    ).rejects.toMatchObject({ status: 409, retryAfter: 1 })
    expect(handler).not.toHaveBeenCalled()
  })

  it("releases the key when the handler throws, so a retry can actually retry", async () => {
    // Holding it would strand the caller: every attempt would report "still in
    // progress" for a request that is never coming back.
    const handler = jest.fn().mockRejectedValue(new Error("boom"))

    await expect(
      withIdempotency(req(KEY), "u1", "tasks", { title: "a" }, handler),
    ).rejects.toThrow("boom")

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", key: KEY },
    })
  })

  it("does not freeze a failure response into the permanent answer", async () => {
    // A 400 the client then corrects must not be replayed forever.
    const handler = jest.fn().mockResolvedValue(NextResponse.json({ error: "bad" }, { status: 400 }))

    await withIdempotency(req(KEY), "u1", "tasks", { title: "a" }, handler)

    expect(prisma.idempotencyKey.update).not.toHaveBeenCalled()
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalled()
  })

  it("scopes keys to the user, so two accounts cannot collide", async () => {
    const handler = jest.fn().mockResolvedValue(okResponse())

    await withIdempotency(req(KEY), "u2", "tasks", { title: "a" }, handler)

    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u2", key: KEY }) }),
    )
  })
})

describe("retention", () => {
  // The table grows by a row per successful create, complete, check-in and
  // progress bump, and nothing ever removed them — there is no scheduler in this
  // app, so the prune has to be opportunistic or it will not exist.
  const NOW = new Date("2026-08-05T12:00:00.000Z")

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers().setSystemTime(NOW)
  })
  afterEach(() => jest.useRealTimers())

  it("keeps a key for 30 days, NOT the usual 48 hours", async () => {
    // Load fresh so the once-per-hour guard starts unset.
    const { withIdempotency } = await import("@/lib/idempotency")
    prisma.idempotencyKey.create.mockResolvedValue({})
    prisma.idempotencyKey.update.mockResolvedValue({})
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 0 })

    await withIdempotency(
      { headers: new Map([["idempotency-key", "k".repeat(16)]]) } as never,
      "u1",
      "tasks",
      { a: 1 },
      async () => ({ status: 201, clone: () => ({ json: async () => ({}) }) }) as never,
    )

    const call = prisma.idempotencyKey.deleteMany.mock.calls.find(
      (c: [{ where?: { createdAt?: { lt?: Date } } }]) => c[0]?.where?.createdAt?.lt,
    )
    expect(call).toBeDefined()
    const cutoff = call![0].where.createdAt.lt as Date
    const days = (NOW.getTime() - cutoff.getTime()) / 86_400_000
    // 48 hours would be WRONG here: the mobile queue holds an op for up to 14
    // days and retries it with the SAME key that whole time. Prune sooner and
    // the retry is no longer recognised, so the handler runs again and creates a
    // duplicate — the exact failure the key exists to prevent.
    expect(days).toBe(30)
    expect(days).toBeGreaterThan(14)
  })
})
