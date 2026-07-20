import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { checkInHabit } from "@/lib/services/habitService"

export const runtime = "nodejs"

/**
 * POST /api/v1/habits/:id/checkin — adjust today's (or `{ date }`'s) check-in by
 * `{ delta }` (default +1). Returns the habit with recomputed stats.
 */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok(await checkInHabit(userId, id, body))
})
