import { forbidden, handleRoute, ok, readJson, tooManyRequests } from "@/lib/apiResponse"
import { isSignupOpen, SIGNUP_CLOSED_MESSAGE } from "@/lib/signupPolicy"
import { registerUser } from "@/lib/services/authService"
import { clientKey, rateLimit, REGISTER_LIMIT } from "@/lib/rateLimit"

export const runtime = "nodejs"

/** POST /api/v1/auth/register — create an account, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  // Same gate, same message, same status as the web form — one policy, two doors.
  if (!isSignupOpen()) throw forbidden(SIGNUP_CLOSED_MESSAGE)
  // Unauthenticated and it writes rows, so without a cap it is a free
  // account-spam endpoint. Per-IP only: there is no account to key on yet.
  const limited = rateLimit(`register:ip:${clientKey(req)}`, REGISTER_LIMIT)
  if (!limited.allowed) throw tooManyRequests(limited.retryAfter)

  const body = await readJson(req)
  return ok(await registerUser(body), 201)
})
