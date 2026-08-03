/**
 * Brute-force protection for the credential endpoints.
 *
 * Login and registration had no throttling at all, so an attacker who could reach
 * the app could try passwords as fast as bcrypt would answer — and the same
 * absence made registration a free account-spam endpoint. DECISIONS.md B5 flagged
 * this as acceptable "on a LAN / behind a VPN"; it is not acceptable the moment
 * the backend is reachable from anywhere else, and there was nothing to switch on
 * when that day came.
 *
 * Deliberately in-memory:
 *   - This is a single-instance self-hosted app. A Redis dependency would be a
 *     bigger operational burden than the problem it solves here.
 *   - Counters reset on restart. That is a real weakness against an attacker who
 *     can bounce the process, but they'd need code execution to do that, at which
 *     point rate limiting is not what's protecting you.
 *   - It does NOT work across replicas. If you ever run more than one instance,
 *     move this to the reverse proxy or a shared store.
 *
 * Fixed-window rather than sliding: a burst straddling a boundary can get up to
 * 2x the limit, which is irrelevant at these thresholds and keeps the bookkeeping
 * to one integer per key.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Stop the map growing without bound on a long-lived process. */
const MAX_KEYS = 10_000

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
  // Still oversized (a real flood of distinct keys): drop the oldest entries
  // rather than let memory grow unbounded.
  if (buckets.size >= MAX_KEYS) {
    const excess = buckets.size - Math.floor(MAX_KEYS / 2)
    let i = 0
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (++i >= excess) break
    }
  }
}

export interface RateLimitResult {
  allowed: boolean
  /** Whole seconds until the window resets — for the Retry-After header. */
  retryAfter: number
  remaining: number
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  sweep(now)
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0, remaining: limit - 1 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }
  return { allowed: true, retryAfter: 0, remaining: limit - existing.count }
}

/** Test seam — also useful if you ever add an admin "unblock me" action. */
export function resetRateLimits() {
  buckets.clear()
}

/**
 * Best-effort client identity.
 *
 * Behind a reverse proxy the socket address is the proxy, so the forwarded
 * headers are the only signal available. They are trivially spoofable by a direct
 * caller, which is fine here: spoofing them buys a fresh bucket, i.e. exactly the
 * no-rate-limiting behaviour we had before, and never MORE than that. The
 * per-identifier limit below is what actually protects a specific account.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

// Tuned for a personal app: generous enough that a human fumbling their password
// never notices, tight enough that guessing is hopeless.
export const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60_000 }
export const REGISTER_LIMIT = { limit: 5, windowMs: 60 * 60_000 }
