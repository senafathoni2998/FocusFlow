import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { completeTask } from "@/lib/services/taskService"

export const runtime = "nodejs"

/**
 * POST /api/v1/tasks/:id/complete — mark complete. A recurring task rolls the same
 * row forward to its next occurrence instead (response `recurred: true`).
 */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await completeTask(userId, id))
})
