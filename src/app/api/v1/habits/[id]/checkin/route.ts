import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { withIdempotency } from "@/lib/idempotency"
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
  // Also a delta: a replayed +1 turns one check-in into two, which then feeds
  // streaks and the month rate.
  return withIdempotency(req, userId, `habits/${id}/checkin`, body, async () =>
    ok(await checkInHabit(userId, id, body)),
  )
})
