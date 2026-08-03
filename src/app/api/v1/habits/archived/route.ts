import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getArchivedHabits } from "@/lib/services/habitService"

export const runtime = "nodejs"

/** GET /api/v1/habits/archived — archived habits for the "show archived" view. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ habits: await getArchivedHabits(userId) })
})
