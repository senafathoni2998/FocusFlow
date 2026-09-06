import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getMe, deleteAccount } from "@/lib/services/authService"

export const runtime = "nodejs"

/** GET /api/v1/auth/me — the authenticated user's profile. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok(await getMe(userId))
})

/**
 * DELETE /api/v1/auth/me — delete the account and everything it owns.
 * Body: `{ password }`. The bearer token says who; the password says they mean it.
 */
export const DELETE = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok(await deleteAccount(userId, body))
})
