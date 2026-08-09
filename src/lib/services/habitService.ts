import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound, badRequest } from "@/lib/apiResponse"
import { satisfiedDayCounts } from "@/lib/habitTotals"
import { computeHabitStats } from "@/lib/habitStats"
import type { Habit as HabitShape } from "@/types/habit"
import { recordTombstone } from "@/lib/tombstones"

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

/**
 * Bump a habit's own `updatedAt` because one of its check-ins changed.
 *
 * A check-in writes `HabitCheckIn`, never `Habit`. Delta sync selects on
 * `Habit.updatedAt`, so without this a habit whose streak just changed does not
 * appear in `GET /api/v1/sync` at all — check in on the phone and the laptop
 * never hears about it, and vice versa, until somebody pulls to refresh. The
 * limitation was documented in two places and worked around in neither; it got
 * worse the day the mobile queue started sending check-ins from offline.
 *
 * Returned as an unawaited Prisma promise so callers can put it in the same
 * `$transaction` as the check-in write. The two must not be able to diverge: a
 * check-in that lands without the touch is invisible to every other device, and
 * a touch without a check-in makes clients re-fetch a habit that did not change.
 *
 * `updatedAt` is set EXPLICITLY rather than relying on the `@updatedAt`
 * attribute, because Prisma will not issue an UPDATE for an empty `data`.
 */
export function touchHabitOnCheckIn(habitId: string, now: Date = new Date()) {
  return prisma.habit.update({ where: { id: habitId }, data: { updatedAt: now } })
}

/** Parse a yyyy-mm-dd (client local day) to a UTC-midnight Date for @db.Date. */
function toCheckInDate(dateStr?: string): Date {
  const now = new Date()
  const m = dateStr ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr) : null
  const [y, mo, d] = m
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  return new Date(Date.UTC(y, mo - 1, d))
}

/**
 * Archived habits, mirroring getArchivedGoals.
 *
 * archiveHabit already accepted `archived: false`, so unarchiving worked — but
 * nothing could LIST an archived habit, which made archiving a one-way trip from
 * either client. Goals had `/goals/archived`; habits had no equivalent.
 */
export async function getArchivedHabits(userId: string) {
  return listHabits(userId, true)
}

export async function getHabits(userId: string) {
  return listHabits(userId, false)
}

/**
 * Attach the server-computed `stats` to a batch of habit rows.
 *
 * Exported for delta sync, which returned raw rows — and the Flutter model
 * silently substitutes HabitStats.empty() when `stats` is absent, so merging one
 * blanked a habit's streak and monthly rate to zero until the next full GET.
 *
 * The limitation this used to carry is now fixed at the source: a check-in
 * touches the habit's own `updatedAt` (see touchHabitOnCheckIn), so a habit
 * whose stats changed DOES appear in a delta.
 */
export async function withHabitStats<T extends { id: string }>(habits: T[]) {
  const totals = await satisfiedDayCounts(habits as never)
  return habits.map((h) => {
    const { checkIns, ...rest } = h as T & { checkIns?: unknown }
    return {
      ...rest,
      stats: computeHabitStats({
        ...rest,
        checkIns,
        totalCheckInDays: totals.get(rest.id),
      } as unknown as HabitShape),
    }
  })
}

async function listHabits(userId: string, archived: boolean) {
  const habits = await prisma.habit.findMany({
    where: { userId, archived },
    orderBy: archived
      ? [{ updatedAt: "desc" }]
      : [{ order: "asc" }, { createdAt: "asc" }],
    include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
  })
  // checkIns are needed to compute the stats but must NOT be spread into the
  // response: the Flutter client has zero readers for them (it renders the
  // server-computed `stats`, per DECISIONS.md B6), so shipping up to 1200 rows per
  // habit added roughly a megabyte of uncompressed payload to every Habits tab.
  // Lifetime totals come from a count, not the capped slice — see habitTotals.
  return withHabitStats(habits)
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
  await recordTombstone(userId, "habit", id)
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

  // One transaction, so the check-in and the habit's own `updatedAt` cannot
  // diverge — see touchHabitOnCheckIn.
  await prisma.$transaction([
    newAmount <= 0
      ? prisma.habitCheckIn.deleteMany({ where: { habitId, date } })
      : prisma.habitCheckIn.upsert({
          where: { habitId_date: { habitId, date } },
          update: { amount: newAmount },
          create: { habitId, date, amount: newAmount },
        }),
    touchHabitOnCheckIn(habitId),
  ])

  const updated = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    include: { checkIns: { orderBy: { date: "desc" }, take: 1200 } },
  })
  // The exact total matters here too: without it, totalDays would differ between
  // this response and the next list fetch, so the number would visibly jump.
  const totals = updated ? await satisfiedDayCounts([updated]) : null
  return {
    success: true,
    // Same projection as getHabits: compute from checkIns, then drop them.
    habit: updated
      ? (({ checkIns, ...rest }) => ({
          ...rest,
          stats: computeHabitStats({
            ...rest,
            checkIns,
            totalCheckInDays: totals?.get(rest.id),
          } as unknown as HabitShape),
        }))(updated)
      : null,
  }
}
