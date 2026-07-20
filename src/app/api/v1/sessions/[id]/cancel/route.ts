import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { cancelSession } from "@/lib/services/sessionService"

export const runtime = "nodejs"

/** POST /api/v1/sessions/:id/cancel — cancel a running focus session. */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await cancelSession(userId, id))
})
