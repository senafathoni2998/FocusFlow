import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getUserSessions, startSession } from "@/lib/services/sessionService"

export const runtime = "nodejs"

/** GET /api/v1/sessions?days=30 — recent focus sessions. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const days = Number(new URL(req.url).searchParams.get("days") ?? 30)
  return ok({ sessions: await getUserSessions(userId, Number.isFinite(days) ? days : 30) })
})

/** POST /api/v1/sessions — start a focus session `{ taskId?, type?, duration }`. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ session: await startSession(userId, body) }, 201)
})
