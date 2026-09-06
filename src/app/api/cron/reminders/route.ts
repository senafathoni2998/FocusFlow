import { timingSafeEqual } from "node:crypto"
import { handleRoute, ok, unauthorized } from "@/lib/apiResponse"
import { dispatchDuePushes } from "@/lib/services/pushService"

export const runtime = "nodejs"
// Never cached and never statically analysed into a build-time fetch: this has
// side effects and must run on every call.
export const dynamic = "force-dynamic"

/**
 * POST /api/cron/reminders — send a push for everything due, then claim it.
 *
 * THIS IS THE ONLY PART OF BACKGROUND PUSH THAT NEEDS INFRASTRUCTURE, and there
 * is no way around it: a closed browser means nothing client-side is running to
 * notice that a reminder came due. Something outside the request cycle has to
 * ask.
 *
 * A cron line rather than a timer inside the app, because nothing inside a
 * Next.js process can be relied on to tick: `next start` gets restarted, may run
 * as several instances (each of which would fire its own duplicate), and in a
 * serverless deployment no process outlives a request at all. One external
 * scheduler works in all three, and is trivially testable with curl.
 *
 *   * * * * * curl -fsS --max-time 50 -X POST http://localhost:3000/api/cron/reminders \
 *       -H "Authorization: Bearer $CRON_SECRET" >/dev/null
 *
 * AUTH IS A SHARED SECRET, not a user session — there is no user in a cron run.
 * Compared in constant time, because a plain `===` on a secret leaks its prefix
 * to anyone willing to time the responses. With CRON_SECRET unset the route
 * refuses everything rather than defaulting open: an unauthenticated endpoint
 * that reads every user's reminders and burns their push quota is not a safe
 * default for a self-hosted app that may be on the open internet.
 */

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = req.headers.get("authorization") ?? ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Comparing a fixed-size digest is the usual fix; here the cheaper one
  // is to compare b with itself when the lengths differ, so the work — and the
  // answer's timing — stays the same shape either way.
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export const POST = handleRoute(async (req) => {
  if (!authorized(req)) throw unauthorized()
  const summary = await dispatchDuePushes()
  // The summary is the whole point of the response: a cron line that silently
  // returns 200 tells an operator nothing about whether push is actually
  // working. `skipped: true` means no VAPID keys are configured.
  return ok(summary)
})
