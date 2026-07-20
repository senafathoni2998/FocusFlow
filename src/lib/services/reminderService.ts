import { z } from "zod"
import { prisma } from "@/lib/prisma"

/** Reminder dispatch queries for the mobile API — mirrors `src/app/actions/reminders.ts`. */

export async function getDueReminders(userId: string) {
  return prisma.reminder.findMany({
    where: { userId, dispatchedAt: null, triggerAt: { lte: new Date() } },
    orderBy: { triggerAt: "asc" },
    include: { task: { select: { id: true, title: true } } },
  })
}

export async function markRemindersDispatched(userId: string, input: unknown) {
  const parsed = z.object({ ids: z.array(z.string()).default([]) }).safeParse(input)
  const ids = parsed.success ? parsed.data.ids : []
  if (ids.length === 0) return { success: true, count: 0 }

  const res = await prisma.reminder.updateMany({
    where: { id: { in: ids.slice(0, 500) }, userId },
    data: { dispatchedAt: new Date() },
  })
  return { success: true, count: res.count }
}
