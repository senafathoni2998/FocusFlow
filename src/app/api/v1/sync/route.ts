import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getChanges, parseSince } from "@/lib/services/syncService"

export const runtime = "nodejs"

/**
 * GET /api/v1/sync?since=<ISO> — everything that changed for this user since the
 * cursor, plus what was deleted. Omit `since` for a full snapshot.
 *
 * The client should store the returned `serverTime` and send it back next time,
 * rather than using its own clock — a device running a few minutes fast would
 * otherwise skip every change in that window without any error to show for it.
 */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const since = parseSince(new URL(req.url).searchParams.get("since"))
  return ok(await getChanges(userId, since))
})
