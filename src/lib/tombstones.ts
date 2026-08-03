import { prisma } from "@/lib/prisma"

/**
 * Record that something was deleted, so a client that was offline can find out.
 *
 * WHY NOT SOFT-DELETE. The usual approach — a `deletedAt` column on every model,
 * filtered in every query — would touch roughly fifty query sites here, and one
 * that forgot the filter would serve deleted rows with no symptom at all: a
 * correctness and privacy bug that only surfaces when someone notices data they
 * deleted is still there. Tombstones keep deletion real, leave every existing
 * query untouched, and make that failure impossible.
 *
 * The failure this design DOES have is mild and self-correcting: a delete path
 * that forgets to call `recordTombstone` leaves a client holding a stale row
 * until its next full refresh. That is a strictly better thing to get wrong.
 *
 * Only top-level entities a client tracks get a tombstone. Nested data — a
 * task's tags, its reminders, a habit's check-ins — travels inside its owning
 * record, so removing one already reaches the client as a change to that record.
 */

export type TombstoneEntity =
  | "task"
  | "list"
  | "tag"
  | "habit"
  | "goal"
  | "savedFilter"

/**
 * Best-effort by design: the row is already gone by the time this runs, so
 * failing here must not turn a successful delete into an error the user sees.
 * The cost of a miss is one stale row on one client until it refreshes fully.
 */
export async function recordTombstone(
  userId: string,
  entityType: TombstoneEntity,
  entityIds: string | string[],
): Promise<void> {
  const ids = (Array.isArray(entityIds) ? entityIds : [entityIds]).filter(Boolean)
  if (ids.length === 0) return

  try {
    await prisma.$transaction(
      ids.map((entityId) =>
        prisma.tombstone.upsert({
          where: { userId_entityType_entityId: { userId, entityType, entityId } },
          // An id that is deleted, recreated and deleted again must report the
          // LATEST deletion, or a client syncing in between would miss it.
          update: { deletedAt: new Date() },
          create: { userId, entityType, entityId },
        }),
      ),
    )
  } catch (error) {
    console.error("[tombstone] failed to record", entityType, ids.length, error)
  }
}

/**
 * Drop the tombstone for an id that exists again.
 *
 * Without this, recreating an entity with a recycled id would leave a tombstone
 * newer than nothing — and a client that saw both would have to guess which won.
 */
export async function clearTombstone(
  userId: string,
  entityType: TombstoneEntity,
  entityId: string,
): Promise<void> {
  try {
    await prisma.tombstone.deleteMany({ where: { userId, entityType, entityId } })
  } catch {
    // Same reasoning as above: never fail a successful write over bookkeeping.
  }
}
