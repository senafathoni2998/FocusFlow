import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getLists, createList } from "@/lib/services/listService"

export const runtime = "nodejs"

/** GET /api/v1/lists — the user's lists (Inbox is the null-listId pseudo-list, not a row). */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ lists: await getLists(userId) })
})

/** POST /api/v1/lists — create a list. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ list: await createList(userId, body) }, 201)
})
