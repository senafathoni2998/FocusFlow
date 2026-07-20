import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { setGoalStatus } from "@/lib/services/goalService"

export const runtime = "nodejs"

/** POST /api/v1/goals/:id/status — set `{ status: "active" | "achieved" | "archived" }`. */
export const POST = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = (await readJson(req)) as { status?: string }
  return ok(await setGoalStatus(userId, id, String(body?.status ?? "")))
})
