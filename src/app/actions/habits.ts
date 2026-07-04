"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { z } from "zod"

/**
 * Habit CRUD + daily check-ins. Follows the app convention:
 * auth() -> ownership findFirst -> Zod -> mutate -> revalidatePath.
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
  habitId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

export async function getHabits() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    return await prisma.habit.findMany({
      where: { userId, archived: false },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      // Cover the 3-year current-streak window in habitStats (366*3 days).
      include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
    })
  } catch (error) {
    return []
  }
}

export async function createHabit(data: {
  name: string
  icon?: string
  color?: string
  frequencyType?: string
  weekdays?: number[]
  weeklyTarget?: number
  goalType?: string
  targetAmount?: number
  unit?: string
}) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const v = habitSchema.parse(data)
    const maxOrder = await prisma.habit.aggregate({
      where: { userId: session.user.id },
      _max: { order: true },
    })

    const habit = await prisma.habit.create({
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
        userId: session.user.id,
      },
    })

    revalidatePath("/habits")
    revalidatePath("/dashboard")
    return { success: true, habit }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    return { error: "Failed to create habit" }
  }
}

export async function updateHabit(id: string, data: Record<string, unknown>) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.habit.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Habit not found" }

    const v = habitSchema.partial().parse(data)
    const habit = await prisma.habit.update({ where: { id }, data: v })

    revalidatePath("/habits")
    revalidatePath("/dashboard")
    return { success: true, habit }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    return { error: "Failed to update habit" }
  }
}

export async function archiveHabit(id: string, archived: boolean) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.habit.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Habit not found" }

    await prisma.habit.update({ where: { id }, data: { archived } })
    revalidatePath("/habits")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    return { error: "Failed to archive habit" }
  }
}

export async function deleteHabit(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.habit.findFirst({ where: { id, userId: session.user.id } })
    if (!existing) return { error: "Habit not found" }

    // Cascades the check-ins.
    await prisma.habit.delete({ where: { id } })
    revalidatePath("/habits")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    return { error: "Failed to delete habit" }
  }
}

/**
 * Adjust a habit's check-in for a given day by `delta` (default +1). The new
 * amount is clamped at 0; reaching 0 removes the check-in. `date` is the client's
 * local yyyy-mm-dd (defaults to server-local today).
 */
export async function checkInHabit(data: { habitId: string; date?: string; delta?: number }) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const v = checkInSchema.parse(data)

    const habit = await prisma.habit.findFirst({
      where: { id: v.habitId, userId: session.user.id },
    })
    if (!habit) return { error: "Habit not found" }

    const date = toCheckInDate(v.date)
    const delta = v.delta ?? 1

    // Reject check-ins dated well into the future (streak gaming). Allow one day
    // of slack so a client in a timezone ahead of the server isn't blocked.
    const maxDate = toCheckInDate()
    maxDate.setUTCDate(maxDate.getUTCDate() + 1)
    if (date > maxDate) return { error: "Invalid date" }

    const existing = await prisma.habitCheckIn.findUnique({
      where: { habitId_date: { habitId: v.habitId, date } },
    })
    const newAmount = Math.max(0, (existing?.amount ?? 0) + delta)

    if (newAmount <= 0) {
      if (existing) await prisma.habitCheckIn.delete({ where: { id: existing.id } })
    } else {
      await prisma.habitCheckIn.upsert({
        where: { habitId_date: { habitId: v.habitId, date } },
        update: { amount: newAmount },
        create: { habitId: v.habitId, date, amount: newAmount },
      })
    }

    revalidatePath("/habits")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    return { error: "Failed to check in" }
  }
}
