import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { refreshTokens } from "@/lib/services/authService"

export const runtime = "nodejs"

/** POST /api/v1/auth/refresh — exchange a refresh token for a fresh token pair. */
export const POST = handleRoute(async (req) => {
  const body = await readJson(req)
  return ok(await refreshTokens(body))
})
