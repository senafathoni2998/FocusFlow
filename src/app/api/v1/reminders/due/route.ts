import { handleRoute, ok } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getDueReminders } from "@/lib/services/reminderService"

export const runtime = "nodejs"

/** GET /api/v1/reminders/due — fired-but-undispatched reminders for the user, soonest first. */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ reminders: await getDueReminders(userId) })
})
