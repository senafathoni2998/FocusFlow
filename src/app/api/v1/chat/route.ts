import { handleRoute, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { runChat } from "@/lib/chat/core"
import { createServicePort } from "@/lib/chat/servicePort"

export const runtime = "nodejs"

/**
 * POST /api/v1/chat — the same assistant the web uses.
 *
 * Same logic, same tools, same prompt: only the data layer differs, and that
 * arrives as a port. A second implementation would have drifted from the web one
 * the first time either changed — which has already happened four times in this
 * codebase between the actions and the services.
 */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = (await readJson(req)) as { message?: unknown; history?: unknown }
  return runChat(createServicePort(userId), {
    message: body?.message,
    history: body?.history,
  })
})
