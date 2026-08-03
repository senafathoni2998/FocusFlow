import { badRequest, handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getUserSessions, startSession, MAX_SESSION_DAYS } from "@/lib/services/sessionService"

export const runtime = "nodejs"

/** GET /api/v1/sessions?days=30 — recent focus sessions. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  // Number.isFinite alone let negatives through (startDate lands in the FUTURE,
  // so the caller silently gets an empty 200) and let ~1e21 through (which makes
  // an Invalid Date that Prisma rejects as a 500). Both are the caller's mistake
  // and deserve a 400 that says so.
  const raw = new URL(req.url).searchParams.get("days")
  let days = 30
  if (raw !== null) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > MAX_SESSION_DAYS) {
      throw badRequest(`days must be an integer between 1 and ${MAX_SESSION_DAYS}`)
    }
    days = n
  }
  return ok({ sessions: await getUserSessions(userId, days) })
})

/** POST /api/v1/sessions — start a focus session `{ taskId?, type?, duration }`. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ session: await startSession(userId, body) }, 201)
})
