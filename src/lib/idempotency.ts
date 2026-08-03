import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ApiError } from "@/lib/apiResponse"

/**
 * Replay-safe writes.
 *
 * A client that queues writes while offline will eventually hit the one failure
 * that has no good answer without this: the request reached the server, the
 * response did not come back, and the client cannot tell whether it worked.
 * Retrying risks a duplicate; not retrying risks losing the write. An
 * idempotency key removes the choice — the retry returns the ORIGINAL response.
 *
 * Opt-in per route, because most endpoints do not need it. Setting a status or
 * reordering a column reaches the same end state however many times it runs.
 * Creating a row does not, and neither does a delta: replaying "+20 pages" or
 * "+1 check-in" is silent corruption, which is precisely why those two are
 * covered here.
 */

const HEADER = "idempotency-key"

export function idempotencyKeyFrom(req: Request): string | null {
  const raw = req.headers.get(HEADER)
  if (!raw) return null
  const key = raw.trim()
  // A key must be long enough to be unique per operation. A client sending "1"
  // would collide with itself across unrelated requests, which is worse than
  // sending none at all.
  if (key.length < 8 || key.length > 200) {
    throw new ApiError(400, "Idempotency-Key must be between 8 and 200 characters")
  }
  return key
}

function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex")
}

/**
 * Run `handler` at most once per (user, key).
 *
 * Without a key this is a plain pass-through, so adding it to a route changes
 * nothing for callers that do not opt in.
 */
export async function withIdempotency(
  req: Request,
  userId: string,
  endpoint: string,
  body: unknown,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = idempotencyKeyFrom(req)
  if (!key) return handler()

  const requestHash = hashBody(body)

  // Claim the key. The unique index is what makes this safe: a concurrent retry
  // loses the insert rather than running the handler a second time.
  try {
    await prisma.idempotencyKey.create({
      data: { userId, key, endpoint, requestHash, status: "pending" },
    })
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e

    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    })
    if (!existing) throw e

    // Same key, different request. Replaying the stored response would answer a
    // question the caller did not ask, so this is refused rather than guessed at.
    if (existing.requestHash !== requestHash) {
      throw new ApiError(422, "Idempotency-Key was already used with a different request body")
    }

    if (existing.status === "pending") {
      // The original is still in flight. Telling the client to wait is the only
      // honest answer: the outcome genuinely is not known yet.
      const err = new ApiError(409, "A request with this Idempotency-Key is still in progress")
      err.retryAfter = 1
      throw err
    }

    return NextResponse.json(existing.responseBody as Record<string, unknown>, {
      status: existing.responseStatus ?? 200,
      // Lets a client tell a replay from a fresh execution, which matters when
      // debugging a queue that is retrying more than it should.
      headers: { "Idempotent-Replay": "true" },
    })
  }

  let response: NextResponse
  try {
    response = await handler()
  } catch (e) {
    // Release the key so a retry can actually retry. Holding it would strand the
    // caller: every attempt would report "still in progress" for a request that
    // is never coming back.
    await prisma.idempotencyKey
      .deleteMany({ where: { userId, key } })
      .catch(() => {})
    throw e
  }

  // Only successful outcomes are worth replaying. Storing a 4xx would freeze a
  // transient failure — say a validation error the client then corrected —
  // into the permanent answer for that key.
  if (response.status >= 200 && response.status < 300) {
    const stored = await response.clone().json().catch(() => null)
    await prisma.idempotencyKey
      .update({
        where: { userId_key: { userId, key } },
        data: { status: "done", responseStatus: response.status, responseBody: stored },
      })
      .catch(() => {})
  } else {
    await prisma.idempotencyKey.deleteMany({ where: { userId, key } }).catch(() => {})
  }

  return response
}
