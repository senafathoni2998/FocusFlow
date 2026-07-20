import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { adjustGoalProgress } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** POST /api/v1/goals/:id/progress — nudge numeric/manual progress by `{ delta }`. */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = (await readJson(req)) as { delta?: number }
  return ok(await adjustGoalProgress(userId, id, Number(body?.delta ?? 0)))
})
