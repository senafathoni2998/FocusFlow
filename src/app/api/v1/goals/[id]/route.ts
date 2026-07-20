import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { updateGoal, deleteGoal } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** PATCH /api/v1/goals/:id — edit goal metadata (title/notes/icon/color/type/target/deadline/status). */
export const PATCH = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok({ goal: await updateGoal(userId, id, body) })
})

/** DELETE /api/v1/goals/:id — delete a goal (its tasks are kept and unlinked). */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteGoal(userId, id))
})
