import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getTags } from "@/lib/services/tagService"

export const runtime = "nodejs"

/** GET /api/v1/tags — the user's tags (created implicitly by typing them onto tasks). */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ tags: await getTags(userId) })
})
