import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { withIdempotency } from "@/lib/idempotency"
import { createSavedFilter, getSavedFilters } from "@/lib/services/savedFilterService"

export const runtime = "nodejs"

/** GET /api/v1/saved-filters — the user's saved views, sidebar order. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ savedFilters: await getSavedFilters(userId) })
})

/** POST /api/v1/saved-filters — save the current view `{ name, query }`. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return withIdempotency(req, userId, "saved-filters", body, async () =>
    ok({ savedFilter: await createSavedFilter(userId, body) }, 201),
  )
})
