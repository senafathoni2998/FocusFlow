import { prisma } from "@/lib/prisma"
import { ApiError } from "@/lib/apiResponse"
import type { ChatPort, ChatRow } from "@/lib/chat/port"
import * as tasks from "@/lib/services/taskService"
import * as goals from "@/lib/services/goalService"
import * as habits from "@/lib/services/habitService"
import { getDueReminders } from "@/lib/services/reminderService"

/**
 * A ChatPort backed by the userId-scoped service layer, for the mobile API.
 *
 * The services throw `ApiError`, while the port's contract is the Server
 * Actions' `{ error }` shape — because that is what the tested dispatch already
 * expects. Translating here keeps the adaptation in ONE place instead of
 * spreading fifteen try/catch blocks through shared logic.
 */

/** Run a service call, turning a thrown ApiError into the `{ error }` the core reads. */
async function attempt<T extends object>(
  run: () => Promise<T>,
  wrap: (value: T) => Record<string, unknown>,
): Promise<Record<string, unknown> & { error?: string }> {
  try {
    return wrap(await run())
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    // An unexpected failure must not leak internals into a model prompt, which
    // is a place the user can read and the model can repeat.
    console.error("[chat/servicePort]", e)
    return { error: "Something went wrong" }
  }
}

export function createServicePort(userId: string): ChatPort {
  return {
    getTasks: () => tasks.listTasks(userId) as Promise<ChatRow[]>,
    createTask: (data) => attempt(() => tasks.createTask(userId, data), (task) => ({ success: true, task })),
    updateTask: (id, data) => attempt(() => tasks.updateTask(userId, id, data), (task) => ({ success: true, task })),
    completeTask: (id) =>
      attempt(
        () => tasks.completeTask(userId, id),
        (res) => ({ success: true, recurred: res.recurred, task: res.task }),
      ),
    deleteTask: (id) => attempt(() => tasks.deleteTask(userId, id), () => ({ success: true })),

    getGoals: () => goals.getGoals(userId) as Promise<ChatRow[]>,
    createGoal: (data) => attempt(() => goals.createGoal(userId, data), (goal) => ({ success: true, goal })),
    updateGoal: (id, data) => attempt(() => goals.updateGoal(userId, id, data), (goal) => ({ success: true, goal })),
    adjustGoalProgress: (id, delta) =>
      attempt(() => goals.adjustGoalProgress(userId, id, delta), (goal) => ({ success: true, goal })),
    setGoalStatus: (id, status) =>
      attempt(() => goals.setGoalStatus(userId, id, status), (goal) => ({ success: true, goal })),
    deleteGoal: (id) => attempt(() => goals.deleteGoal(userId, id), () => ({ success: true })),

    getHabits: () => habits.getHabits(userId) as Promise<ChatRow[]>,
    createHabit: (data) => attempt(() => habits.createHabit(userId, data), (habit) => ({ success: true, habit })),
    checkInHabit: (data) => {
      const { habitId, ...rest } = (data ?? {}) as { habitId?: string }
      if (!habitId) return Promise.resolve({ error: "Habit not found" })
      return attempt(() => habits.checkInHabit(userId, habitId, rest), (res) => ({ ...res }))
    },
    deleteHabit: (id) => attempt(() => habits.deleteHabit(userId, id), () => ({ success: true })),

    getDueReminders: () => getDueReminders(userId) as Promise<ChatRow[]>,

    // Mirrors the web action, minus the session lookup — the caller is already
    // identified by their bearer token.
    getUserAIProviderPref: async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { aiProvider: true },
        })
        return user?.aiProvider ?? null
      } catch {
        return null
      }
    },
  }
}
