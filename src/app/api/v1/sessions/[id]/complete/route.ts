import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { completeSession } from "@/lib/services/sessionService"

export const runtime = "nodejs"

/** POST /api/v1/sessions/:id/complete — mark a focus session completed (stamps endTime). */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok({ session: await completeSession(userId, id) })
})
