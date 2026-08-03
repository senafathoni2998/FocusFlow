import { prisma } from "@/lib/prisma"

/**
 * Exact lifetime count of satisfied days per habit.
 *
 * Both fetch paths load check-ins with `take: 1200` — enough for the streak walks
 * (which are bounded at three years) and small enough not to ship a megabyte of
 * rows. But `totalDays` is a LIFETIME counter, so deriving it from that slice
 * makes it quietly stop growing after about 3.3 years of daily check-ins: the
 * number on screen just freezes, with nothing to indicate it is no longer true.
 *
 * `@@unique([habitId, date])` means one row per day, so "satisfied days" is a
 * plain count of rows whose amount clears the habit's threshold — no grouping
 * needed, and the database does the work instead of the payload.
 */

type HabitThreshold = {
  id: string
  goalType?: string | null
  targetAmount?: number | null
}

/** The per-day amount at which a day counts, mirroring `isSatisfied`. */
function thresholdOf(habit: HabitThreshold): number {
  return habit.goalType === "amount" ? habit.targetAmount ?? 1 : 1
}

/**
 * Returns `habitId -> satisfied-day count`. One query per distinct threshold
 * rather than per habit, so a user with twenty habits still costs one or two
 * round trips.
 */
export async function satisfiedDayCounts(habits: HabitThreshold[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (habits.length === 0) return out

  const byThreshold = new Map<number, string[]>()
  for (const h of habits) {
    const t = thresholdOf(h)
    const bucket = byThreshold.get(t)
    if (bucket) bucket.push(h.id)
    else byThreshold.set(t, [h.id])
  }

  await Promise.all(
    Array.from(byThreshold, async ([threshold, ids]) => {
      const rows = await prisma.habitCheckIn.groupBy({
        by: ["habitId"],
        where: { habitId: { in: ids }, amount: { gte: threshold } },
        _count: { _all: true },
      })
      for (const r of rows) out.set(r.habitId, r._count._all)
    }),
  )

  // A habit with no qualifying check-ins is absent from groupBy; report zero
  // rather than leaving it undefined, or computeHabitStats would fall back to
  // counting the capped array and reintroduce the very drift this removes.
  for (const h of habits) if (!out.has(h.id)) out.set(h.id, 0)
  return out
}
