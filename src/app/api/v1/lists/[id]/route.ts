import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { updateList, deleteList } from "@/lib/services/listService"

export const runtime = "nodejs"

/** PATCH /api/v1/lists/:id — rename / recolor a list. */
export const PATCH = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok({ list: await updateList(userId, id, body) })
})

/** DELETE /api/v1/lists/:id — delete a list (its tasks fall back to the Inbox). */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteList(userId, id))
})
