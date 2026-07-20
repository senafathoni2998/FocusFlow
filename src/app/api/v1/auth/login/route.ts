import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { loginUser } from "@/lib/services/authService"

export const runtime = "nodejs"

/** POST /api/v1/auth/login — verify credentials, return the bearer token pair. */
export const POST = handleRoute(async (req) => {
  const body = await readJson(req)
  return ok(await loginUser(body))
})
