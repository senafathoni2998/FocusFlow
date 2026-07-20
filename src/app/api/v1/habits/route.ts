import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getHabits, createHabit } from "@/lib/services/habitService"

export const runtime = "nodejs"

/** GET /api/v1/habits — active habits, each with server-computed `stats` (streaks, rate, today). */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ habits: await getHabits(userId) })
})

/** POST /api/v1/habits — create a habit. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ habit: await createHabit(userId, body) }, 201)
})
