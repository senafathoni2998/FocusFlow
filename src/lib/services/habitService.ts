import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound, badRequest } from "@/lib/apiResponse"
import { computeHabitStats } from "@/lib/habitStats"
import type { Habit as HabitShape } from "@/types/habit"

/**
 * Habit CRUD + check-ins for the mobile API — mirrors `src/app/actions/habits.ts`.
 * `getHabits` additionally attaches server-computed `stats` (streaks, this-month
 * rate, today status) via the shared `computeHabitStats`, so the Flutter client
 * renders progress without re-implementing the timezone-sensitive scoring.
 */

const habitSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(8).optional(),
  color: z.enum(["primary", "success", "warning", "danger"]).optional(),
  frequencyType: z.enum(["daily", "weekly"]).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  weeklyTarget: z.number().int().min(1).max(7).optional(),
  goalType: z.enum(["achieve", "amount"]).optional(),
  targetAmount: z.number().positive().max(1000).optional(),
  unit: z.string().max(20).optional(),
})

const checkInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  delta: z.number().int().min(-1000).max(1000).optional(),
})

/** Parse a yyyy-mm-dd (client local day) to a UTC-midnight Date for @db.Date. */
function toCheckInDate(dateStr?: string): Date {
  const now = new Date()
  const m = dateStr ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr) : null
  const [y, mo, d] = m
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  return new Date(Date.UTC(y, mo - 1, d))
}

export async function getHabits(userId: string) {
  const habits = await prisma.habit.findMany({
    where: { userId, archived: false },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
  })
  return habits.map((h) => ({
    ...h,
    stats: computeHabitStats(h as unknown as HabitShape),
  }))
}

export async function createHabit(userId: string, input: unknown) {
  const v = habitSchema.parse(input)
  const maxOrder = await prisma.habit.aggregate({ where: { userId }, _max: { order: true } })
  return prisma.habit.create({
    data: {
      name: v.name,
      icon: v.icon || "✅",
      color: v.color || "primary",
      frequencyType: v.frequencyType || "daily",
      weekdays: v.weekdays ?? [],
      weeklyTarget: v.weeklyTarget ?? 1,
      goalType: v.goalType || "achieve",
      targetAmount: v.targetAmount ?? 1,
      unit: v.unit,
      order: (maxOrder._max.order ?? 0) + 10,
      userId,
    },
  })
}

export async function updateHabit(userId: string, id: string, input: unknown) {
  const existing = await prisma.habit.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Habit not found")
  const v = habitSchema.partial().parse(input)
  return prisma.habit.update({ where: { id }, data: v })
}

export async function archiveHabit(userId: string, id: string, archived: boolean) {
  const existing = await prisma.habit.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Habit not found")
  await prisma.habit.update({ where: { id }, data: { archived } })
  return { success: true }
}

export async function deleteHabit(userId: string, id: string) {
  const existing = await prisma.habit.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Habit not found")
  await prisma.habit.delete({ where: { id } }) // cascades check-ins
  return { success: true }
}

/**
 * Adjust a habit's check-in for a day by `delta` (default +1). Clamps at 0; a 0
 * amount removes the check-in. Returns the updated habit WITH recomputed stats so
 * the client can update its card in one round-trip.
 */
export async function checkInHabit(userId: string, habitId: string, input: unknown) {
  const v = checkInSchema.parse(input)

  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId } })
  if (!habit) throw notFound("Habit not found")

  const date = toCheckInDate(v.date)
  const delta = v.delta ?? 1

  const maxDate = toCheckInDate()
  maxDate.setUTCDate(maxDate.getUTCDate() + 1)
  if (date > maxDate) throw badRequest("Invalid date")

  const existing = await prisma.habitCheckIn.findUnique({
    where: { habitId_date: { habitId, date } },
  })
  const newAmount = Math.max(0, (existing?.amount ?? 0) + delta)

  if (newAmount <= 0) {
    if (existing) await prisma.habitCheckIn.delete({ where: { id: existing.id } })
  } else {
    await prisma.habitCheckIn.upsert({
      where: { habitId_date: { habitId, date } },
      update: { amount: newAmount },
      create: { habitId, date, amount: newAmount },
    })
  }

  const updated = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
  })
  return {
    success: true,
    habit: updated
      ? { ...updated, stats: computeHabitStats(updated as unknown as HabitShape) }
      : null,
  }
}
