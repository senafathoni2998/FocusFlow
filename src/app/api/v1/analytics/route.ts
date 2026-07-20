import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getDashboard } from "@/lib/services/analyticsService"

export const runtime = "nodejs"

/** GET /api/v1/analytics — dashboard summary (task counts, focus minutes, goal/habit counts). */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok(await getDashboard(userId))
})
