import { handleRoute, ok, readJson } from "@/lib/apiResponse"
import { requireApiUser } from "@/lib/apiAuth"
import { getTaskById, updateTask, deleteTask } from "@/lib/services/taskService"

export const runtime = "nodejs"

/** GET /api/v1/tasks/:id — a single task. */
export const GET = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok({ task: await getTaskById(userId, id) })
})

/** PATCH /api/v1/tasks/:id — partial update (fields, status, recurrence, tags, reminders). */
export const PATCH = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  const body = await readJson(req)
  return ok({ task: await updateTask(userId, id, body) })
})

/** DELETE /api/v1/tasks/:id */
export const DELETE = handleRoute(async (req, ctx) => {
  const userId = await requireApiUser(req)
  const { id } = await ctx.params
  return ok(await deleteTask(userId, id))
})
