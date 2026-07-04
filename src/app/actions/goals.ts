"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { z } from "zod"

/**
 * Goal CRUD + progress adjustment. Follows the app convention:
 * auth() -> ownership findFirst -> Zod -> mutate -> revalidatePath.
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
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: z.enum(["active", "achieved", "archived"]).optional(),
})

const GOAL_STATUSES = ["active", "achieved", "archived"] as const

/** yyyy-mm-dd (a calendar-day deadline) -> UTC-midnight Date, keyed by calendar day. */
function toTargetDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)!
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/**
 * Strip the raw linked-tasks array off a fetched goal and replace it with derived
 * counts for "tasks"-progress goals: abandoned (wont-do) tasks drop out of the
 * denominator, and recurring tasks are excluded entirely (they roll forward on
 * completion and would otherwise cap the goal below 100% forever).
 */
function withTaskCounts<T extends { tasks?: { status: string; recurrenceId: string | null }[] }>(
  goal: T
) {
  const { tasks, ...rest } = goal
  const counted = (tasks ?? []).filter((t) => t.status !== "wont-do" && !t.recurrenceId)
  return {
    ...rest,
    taskTotal: counted.length,
    taskCompleted: counted.filter((t) => t.status === "completed").length,
  }
}

export async function getGoals() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    const goals = await prisma.goal.findMany({
      where: { userId, status: { not: "archived" } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { tasks: { select: { status: true, recurrenceId: true } } },
    })
    return goals.map(withTaskCounts)
  } catch {
    return []
  }
}

/** Archived goals (with derived task counts) for the "Show archived" section. */
export async function getArchivedGoals() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    const goals = await prisma.goal.findMany({
      where: { userId, status: "archived" },
      orderBy: [{ updatedAt: "desc" }],
      include: { tasks: { select: { status: true, recurrenceId: true } } },
    })
    return goals.map(withTaskCounts)
  } catch {
    return []
  }
}

/** Active/achieved goals as lightweight options for the task-assignment dropdown. */
export async function getGoalOptions() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    return await prisma.goal.findMany({
      where: { userId, status: { not: "archived" } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, icon: true },
    })
  } catch {
    return []
  }
}

export async function createGoal(data: {
  title: string
  description?: string | null
  icon?: string
  color?: string
  progressType?: string
  targetValue?: number | null
  currentValue?: number
  unit?: string | null
  manualProgress?: number
  targetDate?: string | null
  status?: string
}) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const v = goalSchema.parse(data)
    const maxOrder = await prisma.goal.aggregate({
      where: { userId: session.user.id },
      _max: { order: true },
    })

    const goal = await prisma.goal.create({
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
        userId: session.user.id,
      },
    })

    revalidatePath("/goals")
    revalidatePath("/dashboard")
    return { success: true, goal }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    return { error: "Failed to create goal" }
  }
}

export async function updateGoal(id: string, data: Record<string, unknown>) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.goal.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Goal not found" }

    const v = goalSchema.partial().parse(data)

    // Copy through only the fields that were actually provided.
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

    const goal = await prisma.goal.update({ where: { id }, data: patch })

    revalidatePath("/goals")
    revalidatePath("/dashboard")
    return { success: true, goal }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    return { error: "Failed to update goal" }
  }
}

/**
 * Nudge a goal's progress by `delta`. For numeric goals it moves `currentValue`
 * (clamped at 0); for manual goals it moves `manualProgress` (clamped 0-100).
 */
export async function adjustGoalProgress(id: string, delta: number) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  if (!Number.isFinite(delta) || Math.abs(delta) > 1_000_000) return { error: "Invalid input" }

  try {
    const goal = await prisma.goal.findFirst({ where: { id, userId: session.user.id } })
    if (!goal) return { error: "Goal not found" }

    // "tasks" goals derive their progress from linked tasks — nothing to nudge.
    if (goal.progressType === "tasks") return { success: true }

    if (goal.progressType === "numeric") {
      const currentValue = Math.max(0, Math.min(1_000_000, goal.currentValue + delta))
      await prisma.goal.update({ where: { id }, data: { currentValue } })
    } else {
      const manualProgress = Math.max(0, Math.min(100, Math.round(goal.manualProgress + delta)))
      await prisma.goal.update({ where: { id }, data: { manualProgress } })
    }

    revalidatePath("/goals")
    revalidatePath("/dashboard")
    return { success: true }
  } catch {
    return { error: "Failed to update progress" }
  }
}

export async function setGoalStatus(id: string, status: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  if (!GOAL_STATUSES.includes(status as (typeof GOAL_STATUSES)[number])) {
    return { error: "Invalid input" }
  }

  try {
    const existing = await prisma.goal.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Goal not found" }

    await prisma.goal.update({ where: { id }, data: { status } })
    revalidatePath("/goals")
    revalidatePath("/dashboard")
    return { success: true }
  } catch {
    return { error: "Failed to update goal" }
  }
}

export async function deleteGoal(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.goal.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Goal not found" }

    await prisma.goal.delete({ where: { id } })
    revalidatePath("/goals")
    revalidatePath("/dashboard")
    return { success: true }
  } catch {
    return { error: "Failed to delete goal" }
  }
}
