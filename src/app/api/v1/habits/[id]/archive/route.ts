import { z } from "zod"
import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { archiveHabit } from "@/lib/services/habitService"

export const runtime = "nodejs"

// Parsed, not cast. The cast this replaced was erased at runtime, so a
// non-boolean `archived` travelled straight into Prisma's Boolean column and
// blew up there — an opaque 500 where every sibling habit route answers 400.
const bodySchema = z.object({ archived: z.boolean().optional() })

/** POST /api/v1/habits/:id/archive — set `{ archived: boolean }` on a habit. */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const { archived } = bodySchema.parse(await readJson(req))
  return ok(await archiveHabit(userId, id, archived ?? true))
})
