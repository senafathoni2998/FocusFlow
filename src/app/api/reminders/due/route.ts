import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDueReminders } from "@/app/actions/reminders"

export const runtime = "nodejs"

/**
 * Dispatch query for reminders: returns the session user's fired-but-undispatched
 * reminders. The in-app ReminderDispatcher delivers them via the getDueReminders /
 * markRemindersDispatched server actions; this route mirrors that query for any
 * out-of-app poller (e.g. a future service worker).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reminders = await getDueReminders()
  return NextResponse.json({ reminders })
}
