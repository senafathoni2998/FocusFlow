import { handleRoute, ok, readJson, tooManyRequests } from "@/lib/apiResponse"
import { registerUser } from "@/lib/services/authService"
import { clientKey, rateLimit, REGISTER_LIMIT } from "@/lib/rateLimit"

export const runtime = "nodejs"

/** POST /api/v1/auth/register — create an account, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  // Unauthenticated and it writes rows, so without a cap it is a free
  // account-spam endpoint. Per-IP only: there is no account to key on yet.
  const limited = rateLimit(`register:ip:${clientKey(req)}`, REGISTER_LIMIT)
  if (!limited.allowed) throw tooManyRequests(limited.retryAfter)

  const body = await readJson(req)
  return ok(await registerUser(body), 201)
})
