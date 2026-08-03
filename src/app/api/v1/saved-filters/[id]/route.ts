import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { deleteSavedFilter } from "@/lib/services/savedFilterService"

export const runtime = "nodejs"

/** DELETE /api/v1/saved-filters/:id */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteSavedFilter(userId, id))
})
