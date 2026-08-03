import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { reorderSavedFilters } from "@/lib/services/savedFilterService"

export const runtime = "nodejs"

/** POST /api/v1/saved-filters/reorder — `{ orderedIds }`. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok(await reorderSavedFilters(userId, body))
})
