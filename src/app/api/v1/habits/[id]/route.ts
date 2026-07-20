import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { updateHabit, deleteHabit } from "@/lib/services/habitService"

export const runtime = "nodejs"

/** PATCH /api/v1/habits/:id — edit habit fields (name/icon/color/frequency/goal). */
export const PATCH = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok({ habit: await updateHabit(userId, id, body) })
})

/** DELETE /api/v1/habits/:id — delete a habit (cascades its check-ins). */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteHabit(userId, id))
})
