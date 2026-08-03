import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { withIdempotency } from "@/lib/idempotency"
import { completeTask } from "@/lib/services/taskService"

export const runtime = "nodejs"

/**
 * POST /api/v1/tasks/:id/complete — mark complete. A recurring task rolls the same
 * row forward to its next occurrence instead (response `recurred: true`).
 */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  // Not idempotent for a RECURRING task: each call rolls it to the next
  // occurrence and increments completedCount, so a retried request skips an
  // occurrence the user never did.
  return withIdempotency(req, userId, `tasks/${id}/complete`, null, async () =>
    ok(await completeTask(userId, id)),
  )
})
