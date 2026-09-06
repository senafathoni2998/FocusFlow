import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/health — is this instance up, and can it reach its database?
 *
 * Unauthenticated on purpose: it is what docker-compose, the Dockerfile
 * HEALTHCHECK and an uptime monitor poll, and none of them have a session. It
 * leaks nothing but up/down — no version, no counts, no config.
 *
 * Not wrapped in handleRoute, because a database that is down is a 503 (the
 * service is unavailable, try later), not the generic 500 handleRoute would
 * turn a thrown error into. The distinction is what a load balancer keys on.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: true })
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 })
  }
}
