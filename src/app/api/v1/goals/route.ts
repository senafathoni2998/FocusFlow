import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getGoals, createGoal } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** GET /api/v1/goals — active + achieved goals, each with derived `progress`. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ goals: await getGoals(userId) })
})

/** POST /api/v1/goals — create a goal. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ goal: await createGoal(userId, body) }, 201)
})
