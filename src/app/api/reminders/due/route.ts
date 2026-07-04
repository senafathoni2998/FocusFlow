import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDueReminders } from "@/app/actions/reminders"

export const runtime = "nodejs"

/**
 * Dispatch query for reminders: returns the session user's fired-but-undispatched
 * reminders. Store-only — a future delivery worker would poll this, notify, then
 * POST back to mark them dispatched. There is no delivery channel yet.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reminders = await getDueReminders()
  return NextResponse.json({ reminders })
}
