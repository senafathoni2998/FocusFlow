"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { canonicalizeQuery } from "@/lib/savedFilters"
import { z } from "zod"

/**
 * Saved filters are named snapshots of a task view's URL query (filters + sort +
 * view mode). CRUD follows the app convention: auth() -> ownership -> Zod ->
 * mutate -> revalidatePath. The stored `query` is canonicalized to whitelisted
 * keys so nothing arbitrary is persisted.
 */

const savedFilterSchema = z.object({
  name: z.string().min(1).max(60),
  query: z.string().max(500),
})

export async function getSavedFilters() {
  // Session-scoped (no caller userId), so this can't read another user's views.
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    return await prisma.savedFilter.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, query: true },
    })
  } catch {
    return []
  }
}

export async function createSavedFilter(data: { name: string; query: string }) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const v = savedFilterSchema.parse({
      name: (data.name ?? "").trim(),
      query: data.query ?? "",
    })
    const query = canonicalizeQuery(v.query)

    const maxOrder = await prisma.savedFilter.aggregate({
      where: { userId: session.user.id },
      _max: { order: true },
    })

    const savedFilter = await prisma.savedFilter.create({
      data: {
        name: v.name,
        query,
        order: (maxOrder._max.order ?? 0) + 10,
        userId: session.user.id,
      },
      select: { id: true, name: true, query: true },
    })

    revalidatePath("/tasks")
    return { success: true, savedFilter }
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid input", details: error.errors }
    // Unique [userId, name] violation → a view with that name already exists.
    if ((error as { code?: string })?.code === "P2002") {
      return { error: "A saved view with that name already exists" }
    }
    return { error: "Failed to save filter" }
  }
}

export async function deleteSavedFilter(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }

  try {
    const existing = await prisma.savedFilter.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return { error: "Saved filter not found" }

    await prisma.savedFilter.delete({ where: { id } })

    revalidatePath("/tasks")
    return { success: true }
  } catch {
    return { error: "Failed to delete filter" }
  }
}
