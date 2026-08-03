"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

/**
 * Cross-entity search for the command palette.
 *
 * The only search in the app was a title filter inside the tasks view, so finding
 * anything meant first knowing which section it lived in and navigating there.
 * Past a few hundred rows that is the slowest thing in the product.
 *
 * Everything is scoped by `userId` from the session — this is a "use server"
 * export, i.e. a public endpoint, so it takes no caller-supplied identity.
 */

export interface SearchHit {
  id: string
  type: "task" | "goal" | "habit" | "list"
  title: string
  /** Secondary line: status, progress, streak — whatever orients the user. */
  subtitle?: string
  icon?: string
}

const PER_TYPE = 5
const MAX_QUERY_LEN = 100

export async function globalSearch(rawQuery: string): Promise<SearchHit[]> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  const q = (rawQuery ?? "").trim().slice(0, MAX_QUERY_LEN)
  // One character matches almost everything and is never a real intent.
  if (q.length < 2) return []

  try {
    // `mode: "insensitive"` is Postgres-only, which matches this app's only
    // supported database (see lib/email.ts for the same call).
    const contains = { contains: q, mode: "insensitive" as const }

    const [tasks, goals, habits, lists] = await Promise.all([
      prisma.task.findMany({
        where: { userId, OR: [{ title: contains }, { description: contains }] },
        select: { id: true, title: true, status: true, dueDate: true },
        // Open work first, then most recently touched.
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: PER_TYPE,
      }),
      prisma.goal.findMany({
        where: { userId, status: { not: "archived" }, title: contains },
        select: { id: true, title: true, icon: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: PER_TYPE,
      }),
      prisma.habit.findMany({
        where: { userId, archived: false, name: contains },
        select: { id: true, name: true, icon: true },
        orderBy: { order: "asc" },
        take: PER_TYPE,
      }),
      prisma.list.findMany({
        where: { userId, name: contains },
        select: { id: true, name: true },
        orderBy: { order: "asc" },
        take: PER_TYPE,
      }),
    ])

    return [
      ...tasks.map((t) => ({
        id: t.id,
        type: "task" as const,
        title: t.title,
        subtitle: t.status,
      })),
      ...goals.map((g) => ({
        id: g.id,
        type: "goal" as const,
        title: g.title,
        subtitle: g.status,
        icon: g.icon ?? undefined,
      })),
      ...habits.map((h) => ({
        id: h.id,
        type: "habit" as const,
        title: h.name,
        icon: h.icon ?? undefined,
      })),
      ...lists.map((l) => ({
        id: l.id,
        type: "list" as const,
        title: l.name,
      })),
    ]
  } catch {
    return []
  }
}
