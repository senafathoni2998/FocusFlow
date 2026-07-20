import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getMe } from "@/lib/services/authService"

export const runtime = "nodejs"

/** GET /api/v1/auth/me — the authenticated user's profile. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok(await getMe(userId))
})
