import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound, badRequest } from "@/lib/apiResponse"
import { computeGoalProgress } from "@/lib/goalStats"
import type { Goal as GoalShape } from "@/types/goal"

/**
 * Goal CRUD + progress for the mobile API — mirrors `src/app/actions/goals.ts`.
 * Reads attach derived `taskTotal`/`taskCompleted` (for "tasks"-progress goals)
 * and a server-computed `progress` (percent, achieved flag, day countdown) via the
 * shared `computeGoalProgress`, so the client renders without re-deriving.
 */

const goalSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(8).optional(),
  color: z.enum(["primary", "success", "warning", "danger"]).optional(),
  progressType: z.enum(["manual", "numeric", "tasks"]).optional(),
  targetValue: z.number().positive().max(1_000_000).nullable().optional(),
  currentValue: z.number().min(0).max(1_000_000).optional(),
  unit: z.string().max(20).nullable().optional(),
  manualProgress: z.number().int().min(0).max(100).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "achieved", "archived"]).optional(),
})

const GOAL_STATUSES = ["active", "achieved", "archived"] as const

function toTargetDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)!
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function withTaskCounts<
  T extends { tasks?: { status: string; recurrenceId: string | null }[] }
>(goal: T) {
  const { tasks, ...rest } = goal
  const counted = (tasks ?? []).filter((t) => t.status !== "wont-do" && !t.recurrenceId)
  return {
    ...rest,
    taskTotal: counted.length,
    taskCompleted: counted.filter((t) => t.status === "completed").length,
  }
}

/** Attach the derived percent/achieved/countdown so the client renders directly. */
function withProgress<T extends object>(goal: T) {
  return { ...goal, progress: computeGoalProgress(goal as unknown as GoalShape) }
}

export async function getGoals(userId: string) {
  const goals = await prisma.goal.findMany({
    where: { userId, status: { not: "archived" } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { tasks: { select: { status: true, recurrenceId: true } } },
  })
  return goals.map((g) => withProgress(withTaskCounts(g)))
}

export async function getArchivedGoals(userId: string) {
  const goals = await prisma.goal.findMany({
    where: { userId, status: "archived" },
    orderBy: [{ updatedAt: "desc" }],
    include: { tasks: { select: { status: true, recurrenceId: true } } },
  })
  return goals.map((g) => withProgress(withTaskCounts(g)))
}

/** The tasks linked to a goal (session-scoped), for a goal detail view. */
export async function getGoalTasks(userId: string, goalId: string) {
  return prisma.task.findMany({
    where: { userId, goalId, status: { not: "wont-do" }, recurrenceId: null },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, status: true, dueDate: true },
  })
}

export async function createGoal(userId: string, input: unknown) {
  const v = goalSchema.parse(input)
  const maxOrder = await prisma.goal.aggregate({ where: { userId }, _max: { order: true } })
  return prisma.goal.create({
    data: {
      title: v.title,
      description: v.description,
      icon: v.icon || "🎯",
      color: v.color || "primary",
      progressType: v.progressType || "manual",
      targetValue: v.targetValue ?? null,
      currentValue: v.currentValue ?? 0,
      unit: v.unit,
      manualProgress: v.manualProgress ?? 0,
      targetDate: v.targetDate ? toTargetDate(v.targetDate) : null,
      status: v.status || "active",
      order: (maxOrder._max.order ?? 0) + 10,
      userId,
    },
  })
}

export async function updateGoal(userId: string, id: string, input: unknown) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Goal not found")

  const v = goalSchema.partial().parse(input)
  const patch: Record<string, unknown> = {}
  for (const k of [
    "title",
    "description",
    "icon",
    "color",
    "progressType",
    "targetValue",
    "currentValue",
    "unit",
    "manualProgress",
    "status",
  ] as const) {
    if (k in v) patch[k] = v[k]
  }
  if ("targetDate" in v) patch.targetDate = v.targetDate ? toTargetDate(v.targetDate) : null

  return prisma.goal.update({ where: { id }, data: patch })
}

/** Nudge numeric/manual progress by `delta`. "tasks" goals derive progress → no-op. */
export async function adjustGoalProgress(userId: string, id: string, delta: number) {
  if (!Number.isFinite(delta) || Math.abs(delta) > 1_000_000) throw badRequest("Invalid input")

  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) throw notFound("Goal not found")

  if (goal.progressType === "tasks") return { success: true }

  if (goal.progressType === "numeric") {
    const currentValue = Math.max(0, Math.min(1_000_000, goal.currentValue + delta))
    await prisma.goal.update({ where: { id }, data: { currentValue } })
  } else {
    const manualProgress = Math.max(0, Math.min(100, Math.round(goal.manualProgress + delta)))
    await prisma.goal.update({ where: { id }, data: { manualProgress } })
  }
  return { success: true }
}

export async function setGoalStatus(userId: string, id: string, status: string) {
  if (!GOAL_STATUSES.includes(status as (typeof GOAL_STATUSES)[number])) {
    throw badRequest("Invalid status")
  }
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Goal not found")
  await prisma.goal.update({ where: { id }, data: { status } })
  return { success: true }
}

export async function deleteGoal(userId: string, id: string) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Goal not found")
  await prisma.goal.delete({ where: { id } })
  return { success: true }
}
