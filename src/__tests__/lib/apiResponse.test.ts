/**
 * @jest-environment node
 *
 * Shared plumbing for the mobile REST API (`/api/v1/*`). Every one of the 29 route
 * files funnels its errors through `handleRoute`, so a regression here changes the
 * contract for the whole surface at once: the status codes clients branch on, the
 * `{ error, details }` envelope, the Retry-After header on 429s, and — most
 * importantly — the guarantee that an unexpected throw becomes a generic 500 that
 * leaks no internals.
 *
 * `next/server`'s NextResponse.json is stubbed to a readable plain object carrying a
 * minimal header bag, so header side effects are observable.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      const headers = new Map<string, string>()
      return {
        status: init?.status ?? 200,
        body,
        headers: {
          set: (k: string, v: string) => headers.set(k.toLowerCase(), v),
          get: (k: string) => headers.get(k.toLowerCase()) ?? null,
        },
      }
    },
  },
}))

import { z } from "zod"
import {
  ApiError,
  badRequest,
  fail,
  handleRoute,
  notFound,
  ok,
  readJson,
  tooManyRequests,
  unauthorized,
} from "@/lib/apiResponse"

type StubRes = {
  status: number
  body: Record<string, unknown>
  headers: { get: (k: string) => string | null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (fn: (...a: any[]) => any, req: Request = {} as Request) =>
  handleRoute(fn)(req, ctx) as unknown as Promise<StubRes>

describe("ok / fail envelopes", () => {
  it("ok() defaults to 200 and returns the payload unwrapped", () => {
    const res = ok({ tasks: [{ id: "t1" }] }) as unknown as StubRes
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tasks: [{ id: "t1" }] })
  })

  it("ok() honours an explicit status such as 201 for creates", () => {
    expect((ok({ task: { id: "t1" } }, 201) as unknown as StubRes).status).toBe(201)
  })

  it("fail() defaults to 400 and omits `details` entirely when there are none", () => {
    const res = fail("Nope") as unknown as StubRes
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "Nope" })
    expect("details" in res.body).toBe(false)
  })

  it("fail() includes `details` when supplied", () => {
    const res = fail("Invalid input", 422, [{ path: ["title"] }]) as unknown as StubRes
    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: "Invalid input", details: [{ path: ["title"] }] })
  })
})

describe("ApiError factories", () => {
  it("unauthorized/notFound/badRequest carry their canonical statuses", () => {
    expect(unauthorized()).toMatchObject({ status: 401, message: "Unauthorized" })
    expect(notFound()).toMatchObject({ status: 404, message: "Not found" })
    expect(badRequest("Bad title", { field: "title" })).toMatchObject({
      status: 400,
      message: "Bad title",
      details: { field: "title" },
    })
  })

  it("ApiError is a real Error so `instanceof` narrowing in handleRoute works", () => {
    const err = notFound()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.name).toBe("ApiError")
    expect(err.retryAfter).toBeUndefined()
  })

  it("tooManyRequests() is a 429 carrying the retry delay in seconds", () => {
    const err = tooManyRequests(45)
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe(45)
    expect(err.message).toMatch(/try again later/i)
  })
})

describe("handleRoute", () => {
  it("passes the request and route context straight through on the happy path", async () => {
    const handler = jest.fn().mockResolvedValue(ok({ ping: "pong" }))
    const req = { url: "http://x/api/v1/tasks" } as Request
    const res = await run(handler, req)
    expect(handler).toHaveBeenCalledWith(req, ctx)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ping: "pong" })
  })

  it("maps a thrown ApiError to its own status, message and details", async () => {
    const res = await run(async () => {
      throw badRequest("Title is required", { field: "title" })
    })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "Title is required", details: { field: "title" } })
  })

  it("maps a 404 ApiError (the shape ownership checks throw) to a 404", async () => {
    const res = await run(async () => {
      throw notFound("Task not found")
    })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: "Task not found" })
  })

  it("sets Retry-After when the ApiError carries retryAfter", async () => {
    const res = await run(async () => {
      throw tooManyRequests(90)
    })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("90")
  })

  it("does not set Retry-After for errors without a retry delay", async () => {
    const res = await run(async () => {
      throw unauthorized()
    })
    expect(res.status).toBe(401)
    expect(res.headers.get("Retry-After")).toBeNull()
  })

  it("turns a ZodError into a 400 with the field issues in `details`", async () => {
    const schema = z.object({ title: z.string().min(1) })
    const res = await run(async () => {
      schema.parse({ title: "" })
      return ok({})
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Invalid input")
    const details = res.body.details as Array<{ path: (string | number)[] }>
    expect(Array.isArray(details)).toBe(true)
    expect(details[0].path).toEqual(["title"])
  })

  it("turns any other error into a generic 500 that leaks no internals", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const res = await run(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 as user prisma_admin")
    })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "Internal server error" })
    // The message must not reach the client in any field, only the server log.
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|prisma_admin/)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("survives a non-Error throw (e.g. a bare string) with the same generic 500", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    const res = await run(async () => {
      throw "boom"
    })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "Internal server error" })
    spy.mockRestore()
  })

  it("catches synchronous throws from the handler, not just rejected promises", async () => {
    const res = await run(() => {
      throw unauthorized("Missing bearer token")
    })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: "Missing bearer token" })
  })
})

describe("readJson", () => {
  const withBody = (json: () => Promise<unknown>) => ({ json }) as unknown as Request

  it("returns the parsed body when it is valid JSON", async () => {
    await expect(readJson(withBody(async () => ({ title: "Hi" })))).resolves.toEqual({
      title: "Hi",
    })
  })

  it("throws a 400 ApiError when the body is malformed", async () => {
    const req = withBody(async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0")
    })
    await expect(readJson(req)).rejects.toBeInstanceOf(ApiError)
    await expect(readJson(req)).rejects.toMatchObject({
      status: 400,
      message: "Malformed JSON body",
    })
  })

  it("throws a 400 for an empty body (Request#json rejects on empty input)", async () => {
    const req = withBody(async () => {
      throw new SyntaxError("Unexpected end of JSON input")
    })
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 })
  })

  it("its 400 flows through handleRoute as the standard error envelope", async () => {
    const req = withBody(async () => {
      throw new SyntaxError("bad")
    })
    const res = await run(async (r: Request) => ok(await readJson(r)), req)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "Malformed JSON body" })
  })
})
