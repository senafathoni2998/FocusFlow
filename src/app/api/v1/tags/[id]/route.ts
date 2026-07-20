import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { updateTag, deleteTag } from "@/lib/services/tagService"

export const runtime = "nodejs"

/** PATCH /api/v1/tags/:id — rename / recolor a tag. */
export const PATCH = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok({ tag: await updateTag(userId, id, body) })
})

/** DELETE /api/v1/tags/:id — delete a tag (removes it from all tasks). */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteTag(userId, id))
})
