import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { reorderTask } from "@/lib/services/taskService"

export const runtime = "nodejs"

/** POST /api/v1/tasks/reorder — set a task's status + order (board drag / manual sort). */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ task: await reorderTask(userId, body) })
})
