import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getArchivedGoals } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** GET /api/v1/goals/archived — archived goals for the "show archived" view. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ goals: await getArchivedGoals(userId) })
})
