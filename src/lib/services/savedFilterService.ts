import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ApiError, badRequest, notFound } from "@/lib/apiResponse"
import { canonicalizeQuery } from "@/lib/savedFilters"

/**
 * Saved views for the mobile API — mirrors `src/app/actions/savedFilters.ts`.
 *
 * A saved view is just a canonicalised URL query string ("horizon=thisMonth&
 * priority=high&sort=priority"). That representation is deliberately shared with
 * the web rather than re-modelled as structured fields: the same saved view has
 * to mean the same thing on both surfaces, and two encodings of "the same filter"
 * would drift the first time either side gained an option.
 *
 * canonicalizeQuery whitelists the keys and sorts them, so a view saved on either
 * client is byte-identical to the same view saved on the other — which is what
 * lets the UI highlight "you are currently looking at this saved view".
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  query: z.string().max(2000),
})

const SELECT = { id: true, name: true, query: true, order: true } as const

export async function getSavedFilters(userId: string) {
  return prisma.savedFilter.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: SELECT,
  })
}

export async function createSavedFilter(userId: string, input: unknown) {
  const v = createSchema.parse(input)
  const query = canonicalizeQuery(v.query)

  const maxOrder = await prisma.savedFilter.aggregate({
    where: { userId },
    _max: { order: true },
  })

  try {
    return await prisma.savedFilter.create({
      data: { name: v.name, query, order: (maxOrder._max.order ?? 0) + 10, userId },
      select: SELECT,
    })
  } catch (e) {
    // @@unique([userId, name]) — a name clash is the caller's to resolve, not a
    // server fault, so it must not surface as a 500.
    if ((e as { code?: string })?.code === "P2002") {
      throw new ApiError(409, "A saved view with that name already exists")
    }
    throw e
  }
}

export async function deleteSavedFilter(userId: string, id: string) {
  const existing = await prisma.savedFilter.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Saved view not found")
  await prisma.savedFilter.delete({ where: { id } })
  return { success: true }
}

/** Re-order the sidebar. Ownership is proven for every id before anything moves. */
export async function reorderSavedFilters(userId: string, input: unknown) {
  const { orderedIds } = z
    .object({ orderedIds: z.array(z.string().min(1)).min(1).max(200) })
    .parse(input)

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw badRequest("Duplicate id in order")
  }

  const owned = await prisma.savedFilter.findMany({
    where: { id: { in: orderedIds }, userId },
    select: { id: true },
  })
  if (owned.length !== orderedIds.length) throw notFound("Saved view not found")

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.savedFilter.update({ where: { id }, data: { order: index * 10 } }),
    ),
  )
  return { success: true, count: orderedIds.length }
}
