import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildExport, exportFilename } from "@/lib/services/exportService"

export const runtime = "nodejs"
// Always build a fresh snapshot; a cached backup is worse than no backup.
export const dynamic = "force-dynamic"

/**
 * GET /api/export — download this account's full data as JSON.
 *
 * Session-authenticated (the browser hits it directly as a download), and scoped
 * to the session user only; there is no userId parameter to substitute.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const payload = await buildExport(session.user.id)
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename()}"`,
        // A backup must never be served from a cache, shared or otherwise.
        "Cache-Control": "no-store, max-age=0",
      },
    })
  } catch (error) {
    console.error("[export] Failed:", error)
    return NextResponse.json({ error: "Failed to build export" }, { status: 500 })
  }
}
