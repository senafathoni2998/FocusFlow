import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { registerUser } from "@/lib/services/authService"

export const runtime = "nodejs"

/** POST /api/v1/auth/register — create an account, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  const body = await readJson(req)
  return ok(await registerUser(body), 201)
})
