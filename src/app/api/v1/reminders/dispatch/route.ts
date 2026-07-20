import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { markRemindersDispatched } from "@/lib/services/reminderService"

export const runtime = "nodejs"

/** POST /api/v1/reminders/dispatch — mark reminders `{ ids: [...] }` delivered so they stop surfacing. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok(await markRemindersDispatched(userId, body))
})
