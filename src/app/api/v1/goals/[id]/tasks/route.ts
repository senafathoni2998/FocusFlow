import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getGoalTasks } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** GET /api/v1/goals/:id/tasks — the tasks linked to a goal (the progress denominator). */
export const GET = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok({ tasks: await getGoalTasks(userId, id) })
})
