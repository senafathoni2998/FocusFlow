import { handleRoute, ok, readJson, tooManyRequests } from "@/lib/apiResponse"
import { loginUser } from "@/lib/services/authService"
import { clientKey, rateLimit, peekRateLimit, clearRateLimit, LOGIN_LIMIT } from "@/lib/rateLimit"
import { normalizeEmail } from "@/lib/email"

export const runtime = "nodejs"

/** POST /api/v1/auth/login — verify credentials, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  const body = await readJson(req)

  // Two buckets, charged differently — and the difference matters.
  //
  // The per-IP bucket counts EVERY attempt: it limits one host's throughput, and
  // the only party it can inconvenience is that host.
  //
  // The per-account bucket counts only FAILURES and is cleared on success. The
  // first version charged it up front, which turned it into an account-lockout
  // weapon: anyone who knew the address could send ten requests and leave the
  // real owner facing 429 for fifteen minutes with the correct password. A
  // counter that only advances on failure still stops guessing, without handing
  // an unauthenticated stranger a denial-of-service against a known email.
  const ip = rateLimit(`login:ip:${clientKey(req)}`, LOGIN_LIMIT)
  if (!ip.allowed) throw tooManyRequests(ip.retryAfter)

  const rawEmail = (body as { email?: unknown })?.email
  const acctKey =
    typeof rawEmail === "string" && rawEmail.length > 0
      ? `login:acct:${normalizeEmail(rawEmail)}`
      : null

  if (acctKey) {
    const acct = peekRateLimit(acctKey, LOGIN_LIMIT)
    if (!acct.allowed) throw tooManyRequests(acct.retryAfter)
  }

  try {
    const result = await loginUser(body)
    if (acctKey) clearRateLimit(acctKey)
    return ok(result)
  } catch (err) {
    if (acctKey) rateLimit(acctKey, LOGIN_LIMIT)
    throw err
  }
})
