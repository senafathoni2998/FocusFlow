import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { archiveHabit } from "@/lib/services/habitService"

export const runtime = "nodejs"

/** POST /api/v1/habits/:id/archive — set `{ archived: boolean }` on a habit. */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = (await readJson(req)) as { archived?: boolean }
  return ok(await archiveHabit(userId, id, body?.archived ?? true))
})
