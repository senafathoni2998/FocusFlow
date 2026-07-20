import { z } from "zod"
import { startOfDay } from "date-fns"
import { prisma } from "@/lib/prisma"
import { ApiError, badRequest, notFound } from "@/lib/apiResponse"
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  priorityRankOf,
  isTerminalStatus,
} from "@/lib/taskConstants"
import { computeNextOccurrence, isRecurrenceFreq } from "@/lib/recurrence"

/**
 * Task domain logic for the mobile API. This mirrors `src/app/actions/tasks.ts`
 * (the web Server Actions) exactly — same validation, ownership checks, recurrence
 * roll-forward and reminder-diffing — but takes an explicit `userId` (from the
 * bearer token) instead of the session, throws `ApiError` instead of returning
 * `{ error }`, and skips `revalidatePath` (there is no Next cache to bust for a
 * native client). The web actions are intentionally left untouched.
 */

// ---- Shared write helpers (behaviorally identical to the web action's) --------

/** Parse a date input into a Date anchored at LOCAL (server) midnight. */
function parseDateInput(input?: string | null): Date | null {
  if (!input) return null
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (bare) {
    const year = Number(bare[1])
    const month = Number(bare[2])
    const day = Number(bare[3])
    const d = new Date(year, month - 1, day)
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null
    }
    return d
  }
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

const MAX_TAG_LEN = 50
const MAX_TAGS_PER_TASK = 50

function tagCreateInput(tagNames: string[] | undefined, userId: string) {
  const names = Array.from(
    new Set(
      (tagNames ?? [])
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= MAX_TAG_LEN)
    )
  ).slice(0, MAX_TAGS_PER_TASK)
  return names.map((name) => ({
    tag: {
      connectOrCreate: {
        where: { userId_name: { userId, name } },
        create: { name, userId },
      },
    },
  }))
}

const MAX_REMINDERS_PER_TASK = 20

function reminderCreateInput(reminders: string[] | undefined, userId: string) {
  const seen = new Set<number>()
  const out: { triggerAt: Date; userId: string }[] = []
  for (const s of reminders ?? []) {
    const d = new Date(s)
    const t = d.getTime()
    if (isNaN(t) || seen.has(t)) continue
    seen.add(t)
    out.push({ triggerAt: d, userId })
    if (out.length >= MAX_REMINDERS_PER_TASK) break
  }
  return out
}

function normalizeEstimate(v: number | null): number | null | undefined {
  if (v === null) return null
  return Number.isInteger(v) && v > 0 ? v : undefined
}

// ---- Schemas ------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["none", "low", "medium", "high"]).optional(),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  isAllDay: z.boolean().optional(),
  timeEstimateMin: z.number().int().positive().optional(),
  estimatedPomos: z.number().int().positive().optional(),
  parentTaskId: z.string().optional(),
  listId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  reminders: z.array(z.string()).max(100).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in-progress", "completed", "wont-do"]).optional(),
  priority: z.enum(["none", "low", "medium", "high"]).optional(),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  isAllDay: z.boolean().optional(),
  timeEstimateMin: z.number().int().positive().nullable().optional(),
  estimatedPomos: z.number().int().positive().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  listId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  reminders: z.array(z.string()).max(100).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
})

const reorderSchema = z.object({
  id: z.string().min(1),
  newStatus: z.enum(["todo", "in-progress", "completed", "wont-do"]),
  newOrder: z.number().int(),
})

const TASK_INCLUDE = {
  tags: { include: { tag: true } },
  recurrence: true,
  reminders: {
    select: { id: true, triggerAt: true },
    orderBy: { triggerAt: "asc" as const },
  },
}

type RawTask = {
  id: string
  tags?: { tag: unknown }[]
  [k: string]: unknown
}

/**
 * All-day due/start dates are stored at the SERVER's local midnight. Emit them to
 * mobile clients as a bare `yyyy-MM-dd` (the server-local calendar day) instead of
 * a UTC instant, so a device in a different timezone doesn't shift the day when it
 * parses the value (it parses a date-only string as its own local midnight). This
 * round-trips exactly with the `yyyy-MM-dd` the client sends on write.
 */
function toYmdLocal(d: unknown): string | null {
  if (!d) return null
  const dt = new Date(d as string | Date)
  if (isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

/** Flatten TaskTag[] -> tag rows, expose all-day dates as calendar days, attach actualMin. */
function serializeTask(task: RawTask, actualMin = 0) {
  return {
    ...task,
    dueDate: toYmdLocal(task.dueDate),
    startDate: toYmdLocal(task.startDate),
    tags: (task.tags ?? []).map((tt) => tt.tag),
    actualMin,
  }
}

async function actualMinFor(userId: string, taskId: string): Promise<number> {
  const sessions = await prisma.focusSession.findMany({
    where: { userId, status: "completed", type: "pomodoro", taskId },
    select: { startTime: true, endTime: true },
  })
  let mins = 0
  for (const s of sessions) {
    if (!s.endTime) continue
    const m = Math.floor((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
    if (m > 0) mins += m
  }
  return mins
}

// ---- Operations ---------------------------------------------------------------

export async function listTasks(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: TASK_INCLUDE,
  })

  const sessions = await prisma.focusSession.findMany({
    where: { userId, status: "completed", type: "pomodoro", taskId: { not: null } },
    select: { taskId: true, startTime: true, endTime: true },
  })
  const actualByTask = new Map<string, number>()
  for (const s of sessions) {
    if (!s.taskId || !s.endTime) continue
    const mins = Math.floor(
      (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000
    )
    if (mins > 0) actualByTask.set(s.taskId, (actualByTask.get(s.taskId) ?? 0) + mins)
  }

  return tasks.map((t) => serializeTask(t as RawTask, actualByTask.get(t.id) ?? 0))
}

export async function getTaskById(userId: string, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, userId },
    include: TASK_INCLUDE,
  })
  if (!task) throw notFound("Task not found")
  return serializeTask(task as RawTask, await actualMinFor(userId, id))
}

export async function createTask(userId: string, input: unknown) {
  const v = createSchema.parse(input)
  const priority = v.priority ?? "medium"

  if (v.parentTaskId) {
    const parent = await prisma.task.findFirst({
      where: { id: v.parentTaskId, userId },
      select: { id: true },
    })
    if (!parent) throw notFound("Parent task not found")
  }
  if (v.listId) {
    const list = await prisma.list.findFirst({ where: { id: v.listId, userId }, select: { id: true } })
    if (!list) throw notFound("List not found")
  }
  if (v.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: v.goalId, userId }, select: { id: true } })
    if (!goal) throw notFound("Goal not found")
  }

  const maxOrder = await prisma.task.aggregate({
    where: { userId, status: "todo" },
    _max: { order: true },
  })
  const nextOrder = (maxOrder._max.order ?? 0) + 10
  const tagInput = tagCreateInput(v.tags, userId)
  const reminderInput = reminderCreateInput(v.reminders, userId)

  let recurrenceId: string | undefined
  if (isRecurrenceFreq(v.recurrence)) {
    const rule = await prisma.recurrenceRule.create({
      data: {
        freq: v.recurrence,
        interval: 1,
        anchorMode: "due",
        anchorDate: parseDateInput(v.dueDate) ?? parseDateInput(v.startDate) ?? undefined,
        userId,
      },
    })
    recurrenceId = rule.id
  }

  const task = await prisma.task.create({
    data: {
      title: v.title,
      description: v.description,
      priority,
      priorityRank: priorityRankOf(priority),
      dueDate: parseDateInput(v.dueDate),
      startDate: parseDateInput(v.startDate),
      isAllDay: v.isAllDay ?? true,
      timeEstimateMin: v.timeEstimateMin,
      estimatedPomos: v.estimatedPomos,
      parentTaskId: v.parentTaskId,
      listId: v.listId,
      goalId: v.goalId,
      order: nextOrder,
      recurrenceId,
      ...(tagInput.length ? { tags: { create: tagInput } } : {}),
      ...(reminderInput.length ? { reminders: { create: reminderInput } } : {}),
      userId,
    },
    include: TASK_INCLUDE,
  })

  return serializeTask(task as RawTask, 0)
}

export async function updateTask(userId: string, id: string, input: unknown) {
  const data = updateSchema.parse(input)

  const existingTask = await prisma.task.findFirst({
    where: { id, userId },
    include: {
      reminders: { select: { id: true, triggerAt: true } },
      recurrence: { select: { freq: true } },
    },
  })
  if (!existingTask) throw notFound("Task not found")

  const updateData: Record<string, unknown> = {}
  if (data.title !== undefined) updateData.title = data.title
  if (data.description !== undefined) updateData.description = data.description

  if (data.status !== undefined) {
    if (!TASK_STATUSES.includes(data.status as never)) throw badRequest("Invalid status")
    updateData.status = data.status
    updateData.completedAt = isTerminalStatus(data.status)
      ? existingTask.completedAt ?? new Date()
      : null
  }

  if (data.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(data.priority as never)) throw badRequest("Invalid priority")
    updateData.priority = data.priority
    updateData.priorityRank = priorityRankOf(data.priority)
  }

  if (data.dueDate !== undefined) {
    if (data.dueDate === "") {
      updateData.dueDate = null
    } else {
      const parsed = parseDateInput(data.dueDate)
      if (parsed) updateData.dueDate = parsed
    }
  }
  if (data.startDate !== undefined) {
    if (data.startDate === "") {
      updateData.startDate = null
    } else {
      const parsed = parseDateInput(data.startDate)
      if (parsed) updateData.startDate = parsed
    }
  }
  if (data.isAllDay !== undefined) updateData.isAllDay = data.isAllDay
  if (data.timeEstimateMin !== undefined) {
    const val = normalizeEstimate(data.timeEstimateMin)
    if (val !== undefined) updateData.timeEstimateMin = val
  }
  if (data.estimatedPomos !== undefined) {
    const val = normalizeEstimate(data.estimatedPomos)
    if (val !== undefined) updateData.estimatedPomos = val
  }

  if (data.parentTaskId !== undefined) {
    if (data.parentTaskId === null) {
      updateData.parentTaskId = null
    } else if (data.parentTaskId === id) {
      throw badRequest("A task cannot be its own parent")
    } else {
      const parent = await prisma.task.findFirst({
        where: { id: data.parentTaskId, userId },
        select: { id: true },
      })
      if (!parent) throw notFound("Parent task not found")
      updateData.parentTaskId = data.parentTaskId
    }
  }

  if (data.listId !== undefined) {
    if (data.listId === null) {
      updateData.listId = null
    } else {
      const list = await prisma.list.findFirst({ where: { id: data.listId, userId }, select: { id: true } })
      if (!list) throw notFound("List not found")
      updateData.listId = data.listId
    }
  }

  if (data.goalId !== undefined) {
    if (data.goalId === null) {
      updateData.goalId = null
    } else {
      const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId }, select: { id: true } })
      if (!goal) throw notFound("Goal not found")
      updateData.goalId = data.goalId
    }
  }

  if (data.tags !== undefined) {
    updateData.tags = { deleteMany: {}, create: tagCreateInput(data.tags, userId) }
  }

  if (data.reminders !== undefined) {
    const incoming = reminderCreateInput(data.reminders, userId)
    const incomingTimes = new Set(incoming.map((r) => r.triggerAt.getTime()))
    const existing = (existingTask.reminders ?? []) as { id: string; triggerAt: Date }[]
    const existingTimes = new Set(existing.map((r) => new Date(r.triggerAt).getTime()))

    const toDeleteIds = existing
      .filter((r) => !incomingTimes.has(new Date(r.triggerAt).getTime()))
      .map((r) => r.id)
    const toCreate = incoming.filter((r) => !existingTimes.has(r.triggerAt.getTime()))

    const reminderWrite: { deleteMany?: { id: { in: string[] } }; create?: typeof toCreate } = {}
    if (toDeleteIds.length) reminderWrite.deleteMany = { id: { in: toDeleteIds } }
    if (toCreate.length) reminderWrite.create = toCreate
    if (toDeleteIds.length || toCreate.length) updateData.reminders = reminderWrite
  }

  let ruleToDelete: string | null = null
  if (data.recurrence !== undefined) {
    if (isRecurrenceFreq(data.recurrence)) {
      const newDue = data.dueDate !== undefined ? updateData.dueDate : existingTask.dueDate
      const newStart = data.startDate !== undefined ? updateData.startDate : existingTask.startDate
      const anchorDate = (newDue as Date | null) ?? (newStart as Date | null) ?? null
      if (existingTask.recurrenceId) {
        const oldAnchor = existingTask.dueDate ?? existingTask.startDate ?? null
        const freqChanged = existingTask.recurrence?.freq !== data.recurrence
        const anchorChanged = (anchorDate?.getTime() ?? null) !== (oldAnchor?.getTime() ?? null)
        await prisma.recurrenceRule.update({
          where: { id: existingTask.recurrenceId },
          data:
            freqChanged || anchorChanged
              ? { freq: data.recurrence, anchorDate, completedCount: 0 }
              : { freq: data.recurrence },
        })
      } else {
        const rule = await prisma.recurrenceRule.create({
          data: { freq: data.recurrence, interval: 1, anchorMode: "due", anchorDate, userId },
        })
        updateData.recurrenceId = rule.id
      }
    } else if (existingTask.recurrenceId) {
      updateData.recurrenceId = null
      ruleToDelete = existingTask.recurrenceId
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: TASK_INCLUDE,
  })

  if (ruleToDelete) {
    await prisma.recurrenceRule.delete({ where: { id: ruleToDelete } }).catch(() => {})
  }

  return serializeTask(task as RawTask, await actualMinFor(userId, id))
}

export async function completeTask(userId: string, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, userId },
    include: { recurrence: true },
  })
  if (!task) throw notFound("Task not found")

  if (task.recurrence) {
    const anchor =
      task.recurrence.anchorMode === "completion"
        ? startOfDay(new Date())
        : task.dueDate ?? task.startDate ?? startOfDay(new Date())
    const next = computeNextOccurrence(task.recurrence, anchor)

    if (next) {
      const shiftedStart =
        task.startDate && task.dueDate
          ? new Date(next.getTime() - (task.dueDate.getTime() - task.startDate.getTime()))
          : task.startDate

      await prisma.$transaction([
        prisma.task.update({
          where: { id },
          data: { dueDate: next, startDate: shiftedStart, status: "todo", completedAt: null },
        }),
        prisma.recurrenceRule.update({
          where: { id: task.recurrence.id },
          data: { completedCount: { increment: 1 } },
        }),
      ])

      const rolled = await prisma.task.findFirst({ where: { id, userId }, include: TASK_INCLUDE })
      return { recurred: true, task: serializeTask(rolled as RawTask, await actualMinFor(userId, id)) }
    }
  }

  await prisma.task.update({
    where: { id },
    data: { status: "completed", completedAt: task.completedAt ?? new Date() },
  })
  const done = await prisma.task.findFirst({ where: { id, userId }, include: TASK_INCLUDE })
  return { recurred: false, task: serializeTask(done as RawTask, await actualMinFor(userId, id)) }
}

export async function deleteTask(userId: string, id: string) {
  const existing = await prisma.task.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Task not found")

  await prisma.task.delete({ where: { id } })
  if (existing.recurrenceId) {
    await prisma.recurrenceRule.delete({ where: { id: existing.recurrenceId } }).catch(() => {})
  }
  return { success: true }
}

export async function reorderTask(userId: string, input: unknown) {
  const data = reorderSchema.parse(input)
  const existing = await prisma.task.findFirst({ where: { id: data.id, userId } })
  if (!existing) throw notFound("Task not found")

  const task = await prisma.task.update({
    where: { id: data.id },
    data: {
      status: data.newStatus,
      order: data.newOrder,
      completedAt: isTerminalStatus(data.newStatus) ? existing.completedAt ?? new Date() : null,
    },
    include: TASK_INCLUDE,
  })
  return serializeTask(task as RawTask, await actualMinFor(userId, data.id))
}
