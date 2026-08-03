/**
 * @jest-environment node
 *
 * Route-level integration for the /api/v1/goals surface (list, create, update,
 * delete, progress, status, tasks, archived). Proves each handler requires a valid
 * ACCESS token, scopes work to that token's subject, and returns the right JSON
 * envelope + status. The goal service is mocked (its logic is unit-tested in
 * goalService.test.ts); `jose` is stubbed because it is ESM-only; next/server's
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
  async function jwtVerify(
    token: string,
    _k: unknown,
    opts?: { issuer?: string; audience?: string }
  ) {
    const payload = JSON.parse(
      Buffer.from(String(token).replace(/^mock\./, ""), "base64").toString("utf8")
    )
    if (opts?.issuer && payload.iss !== opts.issuer) throw new Error("iss")
    if (opts?.audience && payload.aud !== opts.audience) throw new Error("aud")
    return { payload }
  }
  return { __esModule: true, SignJWT, jwtVerify }
})

jest.mock("@/lib/services/goalService", () => ({
  getGoals: jest.fn(),
  getArchivedGoals: jest.fn(),
  getGoalTasks: jest.fn(),
  createGoal: jest.fn(),
  updateGoal: jest.fn(),
  adjustGoalProgress: jest.fn(),
  setGoalStatus: jest.fn(),
  deleteGoal: jest.fn(),
}))

import { z } from "zod"
import { GET as listGoals, POST as postGoal } from "@/app/api/v1/goals/route"
import { PATCH as patchGoal, DELETE as deleteGoalRoute } from "@/app/api/v1/goals/[id]/route"
import { POST as postProgress } from "@/app/api/v1/goals/[id]/progress/route"
import { POST as postStatus } from "@/app/api/v1/goals/[id]/status/route"
import { GET as listGoalTasks } from "@/app/api/v1/goals/[id]/tasks/route"
import { GET as listArchived } from "@/app/api/v1/goals/archived/route"
import {
  getGoals,
  getArchivedGoals,
  getGoalTasks,
  createGoal,
  updateGoal,
  adjustGoalProgress,
  setGoalStatus,
  deleteGoal,
} from "@/lib/services/goalService"
import { signAccessToken, signRefreshToken } from "@/lib/apiAuth"
import { notFound, badRequest } from "@/lib/apiResponse"

process.env.NEXTAUTH_SECRET = "test-secret-value-at-least-32-characters-long"

/** Route ctx: `/goals` and `/goals/archived` take no params, by-id routes take `id`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noParams = { params: Promise.resolve({}) } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withId = (id = "g1") => ({ params: Promise.resolve({ id }) }) as any

function req(authHeader: string | undefined, body?: unknown): Request {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "authorization" ? (authHeader ?? null) : null),
    },
    json: async () => body,
  } as unknown as Request
}

/** A request whose body can't be parsed, to drive readJson's 400. */
function brokenBodyReq(authHeader: string): Request {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader : null),
    },
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON")
    },
  } as unknown as Request
}

const body = <T>(res: { body: unknown }) => res.body as T

beforeEach(() => jest.clearAllMocks())

describe("auth on the goals surface", () => {
  // One table over every handler: no handler may reach its service without a token.
  const cases: [string, () => Promise<{ status: number; body: unknown }>, jest.Mock][] = [
    ["GET /goals", () => listGoals(req(undefined), noParams), getGoals as jest.Mock],
    ["POST /goals", () => postGoal(req(undefined, { title: "x" }), noParams), createGoal as jest.Mock],
    ["PATCH /goals/:id", () => patchGoal(req(undefined, { title: "x" }), withId()), updateGoal as jest.Mock],
    ["DELETE /goals/:id", () => deleteGoalRoute(req(undefined), withId()), deleteGoal as jest.Mock],
    ["POST /goals/:id/progress", () => postProgress(req(undefined, { delta: 1 }), withId()), adjustGoalProgress as jest.Mock],
    ["POST /goals/:id/status", () => postStatus(req(undefined, { status: "archived" }), withId()), setGoalStatus as jest.Mock],
    ["GET /goals/:id/tasks", () => listGoalTasks(req(undefined), withId()), getGoalTasks as jest.Mock],
    ["GET /goals/archived", () => listArchived(req(undefined), noParams), getArchivedGoals as jest.Mock],
  ]

  it.each(cases)("%s 401s without a bearer token and never calls its service", async (_n, call, svc) => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(body<{ error: string }>(res).error).toMatch(/bearer/i)
    expect(svc).not.toHaveBeenCalled()
  })

  it("401s a refresh token used as an access token (wrong audience)", async () => {
    const refresh = await signRefreshToken("u1")
    const res = await listGoals(req(`Bearer ${refresh}`), noParams)
    expect(res.status).toBe(401)
    expect(body<{ error: string }>(res).error).toMatch(/invalid or expired/i)
    expect(getGoals).not.toHaveBeenCalled()
  })

  it("401s a garbage token rather than 500ing", async () => {
    const res = await listGoals(req("Bearer not-a-real-token"), noParams)
    expect(res.status).toBe(401)
    expect(getGoals).not.toHaveBeenCalled()
  })
})

describe("GET /api/v1/goals", () => {
  it("returns 200 + the token subject's goals", async () => {
    ;(getGoals as jest.Mock).mockResolvedValue([{ id: "g1", progress: { percent: 40 } }])
    const res = await listGoals(req(`Bearer ${await signAccessToken("u1")}`), noParams)

    expect(res.status).toBe(200)
    expect(body<{ goals: unknown[] }>(res).goals).toEqual([{ id: "g1", progress: { percent: 40 } }])
    expect(getGoals).toHaveBeenCalledWith("u1")
  })

  it("scopes to the token's own user, not any client-supplied id", async () => {
    ;(getGoals as jest.Mock).mockResolvedValue([])
    await listGoals(req(`Bearer ${await signAccessToken("u-other")}`), noParams)

    expect(getGoals).toHaveBeenCalledWith("u-other")
  })
})

describe("GET /api/v1/goals/archived", () => {
  it("returns 200 + archived goals only, via the archived-specific service call", async () => {
    ;(getArchivedGoals as jest.Mock).mockResolvedValue([{ id: "g-old", status: "archived" }])
    const res = await listArchived(req(`Bearer ${await signAccessToken("u1")}`), noParams)

    expect(res.status).toBe(200)
    expect(body<{ goals: { status: string }[] }>(res).goals[0].status).toBe("archived")
    expect(getArchivedGoals).toHaveBeenCalledWith("u1")
    // The main list intentionally excludes archived goals; it must not be used here.
    expect(getGoals).not.toHaveBeenCalled()
  })
})

describe("POST /api/v1/goals", () => {
  it("creates a goal (201) and passes the body straight to the service", async () => {
    ;(createGoal as jest.Mock).mockResolvedValue({ id: "g2", title: "Read 12 books" })
    const res = await postGoal(
      req(`Bearer ${await signAccessToken("u9")}`, { title: "Read 12 books" }),
      noParams
    )

    expect(res.status).toBe(201)
    expect(body<{ goal: { id: string } }>(res).goal.id).toBe("g2")
    expect(createGoal).toHaveBeenCalledWith("u9", { title: "Read 12 books" })
  })

  it("turns a service-thrown ZodError into a 400 with details, not a 500", async () => {
    const zodErr = z.object({ title: z.string().min(1) }).safeParse({ title: "" })
    ;(createGoal as jest.Mock).mockRejectedValue(
      (zodErr as { success: false; error: z.ZodError }).error
    )
    const res = await postGoal(req(`Bearer ${await signAccessToken("u1")}`, { title: "" }), noParams)

    expect(res.status).toBe(400)
    expect(body<{ error: string; details: unknown[] }>(res).error).toBe("Invalid input")
    expect(body<{ details: unknown[] }>(res).details.length).toBeGreaterThan(0)
  })

  it("400s a malformed JSON body before reaching the service", async () => {
    const res = await postGoal(brokenBodyReq(`Bearer ${await signAccessToken("u1")}`), noParams)

    expect(res.status).toBe(400)
    expect(body<{ error: string }>(res).error).toMatch(/malformed json/i)
    expect(createGoal).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/v1/goals/:id", () => {
  it("updates the goal named in the path for the token's user", async () => {
    ;(updateGoal as jest.Mock).mockResolvedValue({ id: "g5", title: "Renamed" })
    const res = await patchGoal(
      req(`Bearer ${await signAccessToken("u1")}`, { title: "Renamed" }),
      withId("g5")
    )

    expect(res.status).toBe(200)
    expect(body<{ goal: { title: string } }>(res).goal.title).toBe("Renamed")
    expect(updateGoal).toHaveBeenCalledWith("u1", "g5", { title: "Renamed" })
  })

  it("surfaces the service's ownership 404 as a 404 envelope", async () => {
    ;(updateGoal as jest.Mock).mockRejectedValue(notFound("Goal not found"))
    const res = await patchGoal(
      req(`Bearer ${await signAccessToken("u1")}`, { title: "Mine now" }),
      withId("g-foreign")
    )

    expect(res.status).toBe(404)
    expect(body<{ error: string }>(res).error).toBe("Goal not found")
  })
})

describe("DELETE /api/v1/goals/:id", () => {
  it("returns the service's success envelope at 200", async () => {
    ;(deleteGoal as jest.Mock).mockResolvedValue({ success: true })
    const res = await deleteGoalRoute(req(`Bearer ${await signAccessToken("u1")}`), withId("g7"))

    expect(res.status).toBe(200)
    expect(body<{ success: boolean }>(res).success).toBe(true)
    expect(deleteGoal).toHaveBeenCalledWith("u1", "g7")
  })

  it("surfaces the service's ownership 404", async () => {
    ;(deleteGoal as jest.Mock).mockRejectedValue(notFound("Goal not found"))
    const res = await deleteGoalRoute(
      req(`Bearer ${await signAccessToken("u1")}`),
      withId("g-foreign")
    )

    expect(res.status).toBe(404)
  })
})

describe("POST /api/v1/goals/:id/progress", () => {
  it("forwards the delta (a nudge, not an absolute value) as a number", async () => {
    ;(adjustGoalProgress as jest.Mock).mockResolvedValue({ success: true })
    const res = await postProgress(
      req(`Bearer ${await signAccessToken("u1")}`, { delta: -5 }),
      withId("g3")
    )

    expect(res.status).toBe(200)
    expect(body<{ success: boolean }>(res).success).toBe(true)
    expect(adjustGoalProgress).toHaveBeenCalledWith("u1", "g3", -5)
  })

  it("coerces a numeric string delta so a loosely-typed client still works", async () => {
    ;(adjustGoalProgress as jest.Mock).mockResolvedValue({ success: true })
    await postProgress(req(`Bearer ${await signAccessToken("u1")}`, { delta: "5" }), withId("g3"))

    expect(adjustGoalProgress).toHaveBeenCalledWith("u1", "g3", 5)
  })

  it("passes a non-numeric delta through as NaN, which the service rejects with a 400", async () => {
    ;(adjustGoalProgress as jest.Mock).mockRejectedValue(badRequest("Invalid input"))
    const res = await postProgress(
      req(`Bearer ${await signAccessToken("u1")}`, { delta: "lots" }),
      withId("g3")
    )

    expect(res.status).toBe(400)
    expect(Number.isNaN((adjustGoalProgress as jest.Mock).mock.calls[0][2])).toBe(true)
  })

  it("treats a body with no delta as a zero nudge (current behaviour)", async () => {
    ;(adjustGoalProgress as jest.Mock).mockResolvedValue({ success: true })
    const res = await postProgress(req(`Bearer ${await signAccessToken("u1")}`, {}), withId("g3"))

    expect(res.status).toBe(200)
    expect(adjustGoalProgress).toHaveBeenCalledWith("u1", "g3", 0)
  })
})

describe("POST /api/v1/goals/:id/status", () => {
  it.each(["active", "achieved", "archived"])("forwards the %s transition", async (status) => {
    ;(setGoalStatus as jest.Mock).mockResolvedValue({ success: true })
    const res = await postStatus(
      req(`Bearer ${await signAccessToken("u1")}`, { status }),
      withId("g4")
    )

    expect(res.status).toBe(200)
    expect(setGoalStatus).toHaveBeenCalledWith("u1", "g4", status)
  })

  it("stringifies a missing status to \"\" so the service's allow-list 400s it", async () => {
    ;(setGoalStatus as jest.Mock).mockRejectedValue(badRequest("Invalid status"))
    const res = await postStatus(req(`Bearer ${await signAccessToken("u1")}`, {}), withId("g4"))

    expect(res.status).toBe(400)
    expect(body<{ error: string }>(res).error).toBe("Invalid status")
    expect(setGoalStatus).toHaveBeenCalledWith("u1", "g4", "")
  })

  it("surfaces the service's ownership 404 for a goal the caller doesn't own", async () => {
    ;(setGoalStatus as jest.Mock).mockRejectedValue(notFound("Goal not found"))
    const res = await postStatus(
      req(`Bearer ${await signAccessToken("u1")}`, { status: "archived" }),
      withId("g-foreign")
    )

    expect(res.status).toBe(404)
  })
})

describe("GET /api/v1/goals/:id/tasks", () => {
  it("returns the goal's linked tasks scoped to the token's user", async () => {
    ;(getGoalTasks as jest.Mock).mockResolvedValue([{ id: "t1", title: "Chapter 1" }])
    const res = await listGoalTasks(req(`Bearer ${await signAccessToken("u2")}`), withId("g8"))

    expect(res.status).toBe(200)
    expect(body<{ tasks: unknown[] }>(res).tasks).toEqual([{ id: "t1", title: "Chapter 1" }])
    expect(getGoalTasks).toHaveBeenCalledWith("u2", "g8")
  })

  it("hides another user's goal as an empty list rather than leaking its tasks", async () => {
    ;(getGoalTasks as jest.Mock).mockResolvedValue([])
    const res = await listGoalTasks(
      req(`Bearer ${await signAccessToken("u2")}`),
      withId("g-foreign")
    )

    expect(res.status).toBe(200)
    expect(body<{ tasks: unknown[] }>(res).tasks).toEqual([])
    expect(getGoalTasks).toHaveBeenCalledWith("u2", "g-foreign")
  })
})
