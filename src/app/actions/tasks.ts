"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { z } from "zod"
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  priorityRankOf,
  isTerminalStatus,
} from "@/lib/taskConstants"
import { computeNextOccurrence, isRecurrenceFreq } from "@/lib/recurrence"
import { startOfDay } from "date-fns"

/**
 * Parse a date input into a Date anchored at LOCAL midnight.
 *
 * `<input type="date">` and the AI both send bare `YYYY-MM-DD` strings.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts the day
 * backwards in negative-offset timezones. Building from parts preserves the
 * calendar day the user picked. Full ISO strings (with a time) are parsed as-is.
 */
function parseDateInput(input?: string | null): Date | null {
  if (!input) return null
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (bare) {
    const year = Number(bare[1])
    const month = Number(bare[2])
    const day = Number(bare[3])
    const d = new Date(year, month - 1, day)
    // Reject out-of-range values that JS would silently roll over
    // (e.g. "2024-13-45"); the components must round-trip exactly.
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null
    }
    return d
  }
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Build the nested TaskTag create input from a list of tag names (deduped,
 * trimmed). Each tag is connected if it already exists for the user (by the
 * unique userId+name), otherwise created.
 */
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

/**
 * Build nested Reminder create input from a list of datetime strings. A bare
 * "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">) parses as local time,
 * which is the instant the user picked; full ISO strings are parsed as-is.
 * Invalid values are dropped and the set is deduped + capped.
 */
const MAX_REMINDERS_PER_TASK = 20

function reminderCreateInput(reminders: string[] | undefined, userId: string) {
  // Parse, drop invalid, dedupe by the resolved instant (not the raw string), and
  // stop at the cap — bounded work even if the (schema-capped) array is large.
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

/**
 * Normalize an estimate field for an update: `null` clears it, a positive integer
 * sets it, and anything else (0, negative, non-integer) returns `undefined` so the
 * caller leaves the column untouched rather than persisting garbage.
 */
function normalizeEstimate(v: number | null): number | null | undefined {
  if (v === null) return null
  return Number.isInteger(v) && v > 0 ? v : undefined
}

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["none", "low", "medium", "high"]),
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

export async function createTask(data: {
  title: string
  description?: string
  priority?: string
  dueDate?: string
  startDate?: string
  isAllDay?: boolean
  timeEstimateMin?: number
  estimatedPomos?: number
  parentTaskId?: string
  listId?: string | null
  goalId?: string | null
  tags?: string[]
  reminders?: string[]
  recurrence?: string | null
}) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const validated = taskSchema.parse({
      title: data.title,
      description: data.description,
      priority: data.priority || "medium",
      dueDate: data.dueDate,
      startDate: data.startDate,
      isAllDay: data.isAllDay,
      timeEstimateMin: data.timeEstimateMin,
      estimatedPomos: data.estimatedPomos,
      parentTaskId: data.parentTaskId,
      listId: data.listId,
      goalId: data.goalId,
      tags: data.tags,
      reminders: data.reminders,
      recurrence: data.recurrence,
    })

    // If creating a subtask, verify the parent belongs to this user.
    if (validated.parentTaskId) {
      const parent = await prisma.task.findFirst({
        where: { id: validated.parentTaskId, userId: session.user.id },
        select: { id: true },
      })
      if (!parent) {
        return { error: "Parent task not found" }
      }
    }

    // Verify list ownership if a list was chosen.
    if (validated.listId) {
      const list = await prisma.list.findFirst({
        where: { id: validated.listId, userId: session.user.id },
        select: { id: true },
      })
      if (!list) {
        return { error: "List not found" }
      }
    }

    // Verify goal ownership if a goal was chosen.
    if (validated.goalId) {
      const goal = await prisma.goal.findFirst({
        where: { id: validated.goalId, userId: session.user.id },
        select: { id: true },
      })
      if (!goal) {
        return { error: "Goal not found" }
      }
    }

    // Place new tasks at the end of the "todo" column with a spaced `order`, so
    // drag-reordering has integer room to insert between existing tasks (rather
    // than everything defaulting to 0).
    const maxOrder = await prisma.task.aggregate({
      where: { userId: session.user.id, status: "todo" },
      _max: { order: true },
    })
    const nextOrder = (maxOrder._max.order ?? 0) + 10
    const tagInput = tagCreateInput(validated.tags, session.user.id)
    const reminderInput = reminderCreateInput(validated.reminders, session.user.id)

    // Create the recurrence rule up front (if any) and link it by scalar id, so
    // the Task create stays in Prisma's "unchecked" (scalar FK) form.
    let recurrenceId: string | undefined
    if (isRecurrenceFreq(validated.recurrence)) {
      const rule = await prisma.recurrenceRule.create({
        data: {
          freq: validated.recurrence,
          interval: 1,
          anchorMode: "due",
          // The first occurrence's date, so monthly/yearly rolls don't drift.
          anchorDate:
            parseDateInput(validated.dueDate) ?? parseDateInput(validated.startDate) ?? undefined,
          userId: session.user.id,
        },
      })
      recurrenceId = rule.id
    }

    const task = await prisma.task.create({
      data: {
        title: validated.title,
        description: validated.description,
        priority: validated.priority,
        priorityRank: priorityRankOf(validated.priority),
        dueDate: parseDateInput(validated.dueDate),
        startDate: parseDateInput(validated.startDate),
        isAllDay: validated.isAllDay ?? true,
        timeEstimateMin: validated.timeEstimateMin,
        estimatedPomos: validated.estimatedPomos,
        parentTaskId: validated.parentTaskId,
        listId: validated.listId,
        goalId: validated.goalId,
        order: nextOrder,
        recurrenceId,
        ...(tagInput.length ? { tags: { create: tagInput } } : {}),
        ...(reminderInput.length ? { reminders: { create: reminderInput } } : {}),
        userId: session.user.id,
      },
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    revalidatePath("/goals")

    return { success: true, task }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid input", details: error.errors }
    }
    return { error: "Failed to create task" }
  }
}

export async function updateTask(
  id: string,
  data: {
    title?: string
    description?: string
    status?: string
    priority?: string
    dueDate?: string
    startDate?: string
    isAllDay?: boolean
    timeEstimateMin?: number | null
    estimatedPomos?: number | null
    parentTaskId?: string | null
    listId?: string | null
    goalId?: string | null
    tags?: string[]
    reminders?: string[]
    recurrence?: string | null
  }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify task ownership (and load existing reminders so we can diff, not
    // replace, them below — a full replace would resurface already-delivered ones).
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
      include: {
        reminders: { select: { id: true, triggerAt: true } },
        recurrence: { select: { freq: true } },
      },
    })

    if (!existingTask) {
      return { error: "Task not found" }
    }

    const updateData: any = {}
    if (data.title) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description

    if (data.status) {
      if (!TASK_STATUSES.includes(data.status as never)) {
        return { error: "Invalid status" }
      }
      updateData.status = data.status
      // Stamp completedAt on entering a terminal state (preserving an existing
      // completion time), clear it when reopening.
      if (isTerminalStatus(data.status)) {
        updateData.completedAt = existingTask.completedAt ?? new Date()
      } else {
        updateData.completedAt = null
      }
    }

    if (data.priority) {
      if (!TASK_PRIORITIES.includes(data.priority as never)) {
        return { error: "Invalid priority" }
      }
      updateData.priority = data.priority
      updateData.priorityRank = priorityRankOf(data.priority)
    }

    if (data.dueDate !== undefined) {
      // An empty string is an explicit "clear". A non-empty value that fails to
      // parse (e.g. an out-of-range or non-ISO date the AI rendered) must NOT
      // silently wipe the existing date — leave it untouched in that case.
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
    // Estimates: null clears; a positive integer sets; anything else (0, negative,
    // non-int) is ignored so a bad value can't reach the column (the create path
    // enforces the same via zod .int().positive()).
    if (data.timeEstimateMin !== undefined) {
      const v = normalizeEstimate(data.timeEstimateMin)
      if (v !== undefined) updateData.timeEstimateMin = v
    }
    if (data.estimatedPomos !== undefined) {
      const v = normalizeEstimate(data.estimatedPomos)
      if (v !== undefined) updateData.estimatedPomos = v
    }

    if (data.parentTaskId !== undefined) {
      if (data.parentTaskId === null) {
        updateData.parentTaskId = null
      } else if (data.parentTaskId === id) {
        return { error: "A task cannot be its own parent" }
      } else {
        const parent = await prisma.task.findFirst({
          where: { id: data.parentTaskId, userId: session.user.id },
          select: { id: true },
        })
        if (!parent) {
          return { error: "Parent task not found" }
        }
        updateData.parentTaskId = data.parentTaskId
      }
    }

    if (data.listId !== undefined) {
      if (data.listId === null) {
        updateData.listId = null
      } else {
        const list = await prisma.list.findFirst({
          where: { id: data.listId, userId: session.user.id },
          select: { id: true },
        })
        if (!list) {
          return { error: "List not found" }
        }
        updateData.listId = data.listId
      }
    }

    if (data.goalId !== undefined) {
      if (data.goalId === null) {
        updateData.goalId = null
      } else {
        const goal = await prisma.goal.findFirst({
          where: { id: data.goalId, userId: session.user.id },
          select: { id: true },
        })
        if (!goal) {
          return { error: "Goal not found" }
        }
        updateData.goalId = data.goalId
      }
    }

    if (data.tags !== undefined) {
      // Replace the full tag set: clear existing joins, then connect/create.
      updateData.tags = {
        deleteMany: {},
        create: tagCreateInput(data.tags, session.user.id),
      }
    }

    if (data.reminders !== undefined) {
      // Diff instead of replace: keep reminders whose instant is unchanged (so a
      // delivered reminder's dispatchedAt survives an unrelated task edit), delete
      // the ones that were removed, and create only the genuinely new instants.
      const incoming = reminderCreateInput(data.reminders, session.user.id)
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
      // Only touch the relation when something actually changed.
      if (toDeleteIds.length || toCreate.length) updateData.reminders = reminderWrite
    }

    // Recurrence handled via scalar recurrenceId + separate rule queries, so the
    // update stays in the unchecked (scalar FK) form alongside listId/tags.
    let ruleToDelete: string | null = null
    if (data.recurrence !== undefined) {
      if (isRecurrenceFreq(data.recurrence)) {
        // Anchor to the task's (possibly just-changed) due/start date so
        // monthly/yearly rolls don't drift.
        const newDue = data.dueDate !== undefined ? updateData.dueDate : existingTask.dueDate
        const newStart = data.startDate !== undefined ? updateData.startDate : existingTask.startDate
        const anchorDate = newDue ?? newStart ?? null
        if (existingTask.recurrenceId) {
          // Re-anchor AND restart the occurrence count when the schedule actually
          // changes — either the frequency or the anchoring due/start date. Keeping
          // the old completedCount after a re-anchor would make computeNextOccurrence
          // (which uses anchor + interval*(completedCount+1)) jump far into the
          // future. A no-op save (the edit form resends recurrence + dates
          // unchanged) must leave both the anchor and the count alone.
          const oldAnchor = existingTask.dueDate ?? existingTask.startDate ?? null
          const freqChanged = existingTask.recurrence?.freq !== data.recurrence
          const anchorChanged =
            (anchorDate?.getTime() ?? null) !== (oldAnchor?.getTime() ?? null)
          await prisma.recurrenceRule.update({
            where: { id: existingTask.recurrenceId },
            data:
              freqChanged || anchorChanged
                ? { freq: data.recurrence, anchorDate, completedCount: 0 }
                : { freq: data.recurrence },
          })
        } else {
          const rule = await prisma.recurrenceRule.create({
            data: {
              freq: data.recurrence,
              interval: 1,
              anchorMode: "due",
              anchorDate,
              userId: session.user.id,
            },
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
    })

    if (ruleToDelete) {
      await prisma.recurrenceRule.delete({ where: { id: ruleToDelete } }).catch(() => {})
    }

    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    revalidatePath("/goals")

    return { success: true, task }
  } catch (error) {
    return { error: "Failed to update task" }
  }
}

export async function deleteTask(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify task ownership
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existingTask) {
      return { error: "Task not found" }
    }

    await prisma.task.delete({
      where: { id },
    })

    // Clean up the (now orphaned) recurrence rule, if any.
    if (existingTask.recurrenceId) {
      await prisma.recurrenceRule
        .delete({ where: { id: existingTask.recurrenceId } })
        .catch(() => {})
    }

    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    revalidatePath("/goals")

    return { success: true }
  } catch (error) {
    return { error: "Failed to delete task" }
  }
}

/**
 * Mark a task complete. For a recurring task with a remaining occurrence, roll
 * the SAME row forward (shift due/start dates, reset to todo, bump the rule's
 * completedCount) instead of completing it — so it stays in horizon queries.
 */
export async function completeTask(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const task = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
      include: { recurrence: true },
    })

    if (!task) {
      return { error: "Task not found" }
    }

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

        revalidatePath("/tasks")
        revalidatePath("/dashboard")
        revalidatePath("/goals")
        return { success: true, recurred: true }
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { status: "completed", completedAt: task.completedAt ?? new Date() },
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    revalidatePath("/goals")
    return { success: true, task: updated }
  } catch (error) {
    return { error: "Failed to complete task" }
  }
}

export async function getTasks(userId?: string) {
  // If userId is provided, use it directly (for API routes)
  // Otherwise, get session (for Server Actions)
  let targetUserId = userId

  if (!targetUserId) {
    const session = await auth()
    targetUserId = session?.user?.id
  }

  if (!targetUserId) {
    return []
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { userId: targetUserId },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        tags: { include: { tag: true } },
        recurrence: true,
        reminders: { select: { id: true, triggerAt: true }, orderBy: { triggerAt: "asc" } },
      },
    })

    // Actual time per task = summed wall-clock of that task's COMPLETED pomodoro
    // sessions (derived, not stored). Not the `duration` column — that's planned
    // seconds. One query, bucketed by taskId, rather than a per-task include.
    const sessions = await prisma.focusSession.findMany({
      where: {
        userId: targetUserId,
        status: "completed",
        type: "pomodoro",
        taskId: { not: null },
      },
      select: { taskId: true, startTime: true, endTime: true },
    })
    const actualByTask = new Map<string, number>()
    for (const s of sessions) {
      if (!s.taskId || !s.endTime) continue
      const mins = Math.floor(
        (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000,
      )
      if (mins > 0) actualByTask.set(s.taskId, (actualByTask.get(s.taskId) ?? 0) + mins)
    }

    // Flatten TaskTag[] -> the tag rows for the client, and attach derived actualMin.
    return tasks.map((t) => ({
      ...t,
      tags: (t.tags ?? []).map((tt) => tt.tag),
      actualMin: actualByTask.get(t.id) ?? 0,
    }))
  } catch (error) {
    return []
  }
}

export async function reorderTask(data: {
  id: string
  newStatus: string
  newOrder: number
}) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify task ownership
    const existingTask = await prisma.task.findFirst({
      where: { id: data.id, userId: session.user.id },
    })

    if (!existingTask) {
      return { error: "Task not found" }
    }

    // Update the task with new status and order. Keep completedAt in sync when
    // a drag moves a card into (or out of) a terminal column.
    const task = await prisma.task.update({
      where: { id: data.id },
      data: {
        status: data.newStatus,
        order: data.newOrder,
        completedAt: isTerminalStatus(data.newStatus)
          ? existingTask.completedAt ?? new Date()
          : null,
      },
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")
    revalidatePath("/goals")

    return { success: true, task }
  } catch (error) {
    console.error("[reorderTask] Error:", error)
    return { error: "Failed to reorder task" }
  }
}
