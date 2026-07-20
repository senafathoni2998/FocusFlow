import { NextResponse } from "next/server"
import { z } from "zod"

/**
 * Shared helpers for the mobile REST API under `/api/v1/*`.
 *
 * The web app talks to the backend through Next.js Server Actions; native clients
 * (the Flutter app) can't invoke those, so these routes expose the same domain
 * logic as plain JSON over HTTP. Responses use a consistent envelope:
 *   success -> the resource/collection directly (e.g. `{ task }`, `{ tasks }`)
 *   failure -> `{ error: string, details?: unknown }` with an HTTP status.
 */

/** A thrown error that carries an HTTP status, caught by `handleRoute`. */
export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

export const unauthorized = (msg = "Unauthorized") => new ApiError(401, msg)
export const notFound = (msg = "Not found") => new ApiError(404, msg)
export const badRequest = (msg = "Invalid input", details?: unknown) =>
  new ApiError(400, msg, details)

/** JSON success response. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status })
}

/** JSON error response. */
export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json(details ? { error: message, details } : { error: message }, {
    status,
  })
}

/**
 * Wrap a route handler so thrown `ApiError`s (and Zod validation errors) become
 * clean JSON responses instead of unhandled 500s. Any other error is logged and
 * returned as a generic 500 so internals never leak to the client.
 */
export function handleRoute(
  fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      return await fn(req, ctx)
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.message, error.status, error.details)
      }
      if (error instanceof z.ZodError) {
        return fail("Invalid input", 400, error.errors)
      }
      console.error("[api/v1] Unhandled error:", error)
      return fail("Internal server error", 500)
    }
  }
}

/** Parse a request JSON body, mapping malformed/empty bodies to a 400. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw badRequest("Malformed JSON body")
  }
}
