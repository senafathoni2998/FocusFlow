"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { z } from "zod"

/**
 * Lists are the primary task container (a task lives in at most one list; a null
 * listId means the Inbox). CRUD follows the app convention:
 * auth() -> ownership findFirst -> Zod -> mutate -> revalidatePath.
 */

const listSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(30).optional(),
})

export async function getLists() {
  // Always scoped to the authenticated user — no caller-supplied userId, so this
  // server action can't be invoked to read another user's lists.
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return []
  }

  try {
    return await prisma.list.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })
  } catch (error) {
    return []
  }
}

export async function createList(data: { name: string; color?: string }) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const validated = listSchema.parse(data)

    const maxOrder = await prisma.list.aggregate({
      where: { userId: session.user.id },
      _max: { order: true },
    })

    const list = await prisma.list.create({
      data: {
        name: validated.name,
        color: validated.color,
        order: (maxOrder._max.order ?? 0) + 10,
        userId: session.user.id,
      },
    })

    revalidatePath("/tasks")

    return { success: true, list }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid input", details: error.errors }
    }
    return { error: "Failed to create list" }
  }
}

export async function updateList(id: string, data: { name?: string; color?: string | null }) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const existing = await prisma.list.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return { error: "List not found" }
    }

    const updateData: any = {}
    if (data.name !== undefined) {
      const name = data.name.trim()
      if (!name) return { error: "List name is required" }
      updateData.name = name
    }
    if (data.color !== undefined) updateData.color = data.color

    const list = await prisma.list.update({ where: { id }, data: updateData })

    revalidatePath("/tasks")

    return { success: true, list }
  } catch (error) {
    return { error: "Failed to update list" }
  }
}

export async function deleteList(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const existing = await prisma.list.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return { error: "List not found" }
    }

    // onDelete: SetNull re-parents this list's tasks to the Inbox rather than
    // deleting them.
    await prisma.list.delete({ where: { id } })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (error) {
    return { error: "Failed to delete list" }
  }
}

export async function reorderList(id: string, newOrder: number) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const existing = await prisma.list.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return { error: "List not found" }
    }

    const list = await prisma.list.update({ where: { id }, data: { order: newOrder } })

    revalidatePath("/tasks")

    return { success: true, list }
  } catch (error) {
    return { error: "Failed to reorder list" }
  }
}
