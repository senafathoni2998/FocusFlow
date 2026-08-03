import { handleRoute, ok, readJson, tooManyRequests } from "@/lib/apiResponse"
import { loginUser } from "@/lib/services/authService"
import { clientKey, rateLimit, LOGIN_LIMIT } from "@/lib/rateLimit"
import { normalizeEmail } from "@/lib/email"

export const runtime = "nodejs"

/** POST /api/v1/auth/login — verify credentials, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  const body = await readJson(req)

  // Two independent buckets. The per-IP one stops a single host grinding through
  // many accounts; the per-email one stops a distributed attempt against ONE
  // account, which an IP bucket alone would miss entirely.
  const ip = rateLimit(`login:ip:${clientKey(req)}`, LOGIN_LIMIT)
  if (!ip.allowed) throw tooManyRequests(ip.retryAfter)

  const rawEmail = (body as { email?: unknown })?.email
  if (typeof rawEmail === "string" && rawEmail.length > 0) {
    const acct = rateLimit(`login:acct:${normalizeEmail(rawEmail)}`, LOGIN_LIMIT)
    if (!acct.allowed) throw tooManyRequests(acct.retryAfter)
  }

  return ok(await loginUser(body))
})
