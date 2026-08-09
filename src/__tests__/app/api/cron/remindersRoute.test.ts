/**
 * @jest-environment node
 *
 * POST /api/cron/reminders — the one endpoint in the app authenticated by a
 * shared secret rather than a user, because a cron run has no user.
 *
 * It reads every user's due reminders and spends their push quota, and a
 * self-hosted install may well be on the open internet, so the tests below are
 * mostly about it being closed by default.
 */
// NextResponse.json is stubbed to a readable object, the same way the /api/v1
// route tests do it — the jsdom Response polyfill has no static `json`.
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      headers: new Map(),
      json: async () => body,
    }),
  },
}))

jest.mock("@/lib/services/pushService", () => ({
  dispatchDuePushes: jest.fn(),
}))

import { POST } from "@/app/api/cron/reminders/route"

import { dispatchDuePushes } from "@/lib/services/pushService"

const mockDispatch = dispatchDuePushes as jest.MockedFunction<typeof dispatchDuePushes>

const ctx = { params: Promise.resolve({}) }

function post(auth?: string) {
  return POST(
    new Request("http://localhost/api/cron/reminders", {
      method: "POST",
      headers: auth === undefined ? {} : { authorization: auth },
    }),
    ctx,
  )
}

const ORIGINAL = process.env.CRON_SECRET

beforeEach(() => {
  jest.resetAllMocks()
  mockDispatch.mockResolvedValue({ users: 1, delivered: 2, pruned: 0, deferred: 0 })
  process.env.CRON_SECRET = "s3cret"
})

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

describe("auth", () => {
  it("runs the dispatch and returns the summary for the right secret", async () => {
    const res = await post("Bearer s3cret")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      users: 1,
      delivered: 2,
      pruned: 0,
      deferred: 0,
    })
    expect(mockDispatch).toHaveBeenCalledTimes(1)
  })

  it("accepts the bare secret too, since crontab quoting is a minefield", async () => {
    const res = await post("s3cret")
    expect(res.status).toBe(200)
  })

  it("refuses a wrong secret WITHOUT dispatching", async () => {
    const res = await post("Bearer wrong!")
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("refuses a missing header", async () => {
    const res = await post()
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("refuses a prefix of the secret", async () => {
    // The reason the comparison is constant-time and length-checked rather than
    // a startsWith or a loose equality.
    const res = await post("Bearer s3cre")
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("is CLOSED, not open, when CRON_SECRET is unset", async () => {
    // The failure mode that matters. An endpoint that defaults open here reads
    // every user's reminders and burns their push quota for anyone who finds it.
    delete process.env.CRON_SECRET

    expect((await post("Bearer anything")).status).toBe(401)
    expect((await post()).status).toBe(401)
    expect((await post("Bearer ")).status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

describe("reporting", () => {
  it("passes `skipped` through, so an operator can see push is not configured", async () => {
    // A cron line that always answers 200 tells nobody whether push works.
    mockDispatch.mockResolvedValue({
      users: 0,
      delivered: 0,
      pruned: 0,
      deferred: 0,
      skipped: true,
    })

    const res = await post("Bearer s3cret")
    await expect(res.json()).resolves.toMatchObject({ skipped: true })
  })
})
