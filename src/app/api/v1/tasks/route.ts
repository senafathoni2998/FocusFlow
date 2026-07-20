import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { listTasks, createTask } from "@/lib/services/taskService"

export const runtime = "nodejs"

/** GET /api/v1/tasks — all of the user's tasks (top-level + subtasks, with tags/recurrence/reminders). */
export const GET = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  return ok({ tasks: await listTasks(userId) })
})

/** POST /api/v1/tasks — create a task. */
export const POST = handleRoute(async (req) => {
  const userId = await requireApiUser(req)
  const body = await readJson(req)
  return ok({ task: await createTask(userId, body) }, 201)
})
