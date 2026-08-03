import { prisma } from "@/lib/prisma"
import { badRequest } from "@/lib/apiResponse"

/**
 * Delta sync: everything that changed for one user since a cursor.
 *
 * The cursor is a server timestamp the client got from a previous response, not
 * a clock the client keeps itself — a phone whose clock is a few minutes fast
 * would otherwise skip every change in that window, permanently and silently.
 *
 * Deletions come from the Tombstone table rather than a `deletedAt` column on
 * every model; see lib/tombstones.ts for why that trade was made.
 */

/**
 * Overlap subtracted from the cursor on every request.
 *
 * Two rows written inside the same transaction can land microseconds apart, and
 * a client that resumes at exactly the previous `serverTime` can fall in the
 * gap. Re-sending a little is free — the client upserts by id, so a repeat is a
 * no-op — whereas a missed row stays missed until a full refresh.
 */
const CURSOR_OVERLAP_MS = 1000

/** A first sync has no cursor; everything is "changed". */
export function parseSince(raw: string | null): Date | null {
  if (raw === null || raw === "") return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) throw badRequest("since must be an ISO-8601 timestamp")
  if (d.getTime() > Date.now() + 60_000) {
    // A cursor from the future would return nothing, forever, with no error.
    throw badRequest("since is in the future")
  }
  return new Date(d.getTime() - CURSOR_OVERLAP_MS)
}

const TASK_INCLUDE = {
  tags: { include: { tag: true } },
  recurrence: true,
  reminders: { select: { id: true, triggerAt: true, dispatchedAt: true } },
}

export async function getChanges(userId: string, since: Date | null) {
  // Captured BEFORE the reads. Taking it afterwards would set the next cursor
  // past rows written while these queries ran, losing them for good.
  const serverTime = new Date()
  const changed = since ? { gte: since } : undefined
  const where = since ? { userId, updatedAt: changed } : { userId }

  const [tasks, lists, tags, habits, goals, savedFilters, sessions, tombstones] =
    await Promise.all([
      prisma.task.findMany({ where, include: TASK_INCLUDE, orderBy: { updatedAt: "asc" } }),
      prisma.list.findMany({ where, orderBy: { updatedAt: "asc" } }),
      prisma.tag.findMany({ where, orderBy: { updatedAt: "asc" } }),
      prisma.habit.findMany({ where, orderBy: { updatedAt: "asc" } }),
      prisma.goal.findMany({ where, orderBy: { updatedAt: "asc" } }),
      prisma.savedFilter.findMany({ where, orderBy: { updatedAt: "asc" } }),
      prisma.focusSession.findMany({ where, orderBy: { updatedAt: "asc" } }),
      since
        ? prisma.tombstone.findMany({
            where: { userId, deletedAt: { gte: since } },
            orderBy: { deletedAt: "asc" },
          })
        : // A first sync has nothing to delete: the client is starting empty, so
          // shipping every tombstone the account ever accumulated is pure noise.
          Promise.resolve([]),
    ])

  return {
    serverTime: serverTime.toISOString(),
    // Tells the client whether to merge or replace, rather than making it infer
    // that from the absence of a cursor it sent.
    full: since === null,
    changed: {
      tasks: tasks.map((t) => ({ ...t, tags: t.tags.map((tt) => tt.tag) })),
      lists,
      tags,
      habits,
      goals,
      savedFilters,
      focusSessions: sessions,
    },
    deleted: tombstones.map((t) => ({
      entityType: t.entityType,
      entityId: t.entityId,
      deletedAt: t.deletedAt,
    })),
  }
}
