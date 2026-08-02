import { prisma } from "@/lib/prisma"

/**
 * Full-fidelity export of one user's data.
 *
 * Self-hosting means there is no vendor safety net: if the Postgres volume dies,
 * or a migration goes wrong, or a bug corrupts data silently (this codebase has
 * shipped several that did), the only recovery is whatever the owner exported.
 * `backup.sh` dumps the database but needs shell access to the server, which is
 * exactly what you don't have from a phone or someone else's laptop.
 *
 * JSON rather than CSV: tasks carry tags, reminders, a recurrence rule and
 * parent/child links, and habits carry check-ins. A flat CSV cannot represent any
 * of that without either losing the relations or exploding into a dozen files
 * whose joins the user has to reassemble by hand.
 *
 * Ids are preserved verbatim. They are the only thing that makes the relations in
 * the file resolvable, and keeping them lets a future importer detect "this row
 * already exists" instead of blindly duplicating everything.
 */

export const EXPORT_FORMAT_VERSION = 1

export async function buildExport(userId: string) {
  const [user, lists, tags, tasks, habits, goals, sessions, savedFilters] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        // Never export the password hash or the AI API keys — a backup file is
        // the single most likely thing to end up in a shared folder.
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.list.findMany({ where: { userId }, orderBy: { order: "asc" } }),
      prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      prisma.task.findMany({
        where: { userId },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          tags: { select: { tag: { select: { id: true, name: true } } } },
          recurrence: true,
          reminders: { select: { id: true, triggerAt: true, dispatchedAt: true } },
        },
      }),
      prisma.habit.findMany({
        where: { userId },
        orderBy: { order: "asc" },
        include: { checkIns: { orderBy: { date: "asc" } } },
      }),
      prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.focusSession.findMany({
        where: { userId },
        orderBy: { startTime: "asc" },
      }),
      prisma.savedFilter.findMany({ where: { userId }, orderBy: { order: "asc" } }),
    ])

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    // Archived rows are included deliberately: they are exactly the data the UI
    // hides, so a backup that skipped them would quietly lose the most
    // forgettable half of the account.
    user,
    lists,
    tags,
    tasks: tasks.map((t) => ({
      ...t,
      tags: t.tags.map((tt) => tt.tag),
    })),
    habits,
    goals,
    focusSessions: sessions,
    savedFilters,
    counts: {
      lists: lists.length,
      tags: tags.length,
      tasks: tasks.length,
      habits: habits.length,
      goals: goals.length,
      focusSessions: sessions.length,
      savedFilters: savedFilters.length,
    },
  }
}

/** `focusflow-export-2026-08-02.json` */
export function exportFilename(now: Date = new Date()): string {
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`
  return `focusflow-export-${ymd}.json`
}
