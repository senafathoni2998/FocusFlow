/**
 * @jest-environment node
 *
 * GET /api/health is what compose, the Dockerfile HEALTHCHECK and an uptime
 * monitor poll. Two things matter: a dead database is a 503, not a 500 (that is
 * the distinction a load balancer keys on), and the body says nothing beyond
 * up/down.
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

import { GET } from "@/app/api/health/route"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

describe("GET /api/health", () => {
  it("answers 200 when the database answers", async () => {
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ "?column?": 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })

  it("answers 503 — not 500 — when the database does not", async () => {
    prisma.$queryRaw = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })

  it("leaks nothing but up/down: no version, no error text, no config", async () => {
    prisma.$queryRaw = jest.fn().mockRejectedValue(new Error("password authentication failed for user"))
    const res = await GET()
    expect(Object.keys(res.body as object).sort()).toEqual(["db", "ok"])
    expect(JSON.stringify(res.body)).not.toMatch(/password|user|error/i)
  })
})
