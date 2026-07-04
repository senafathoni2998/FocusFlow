"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

/**
 * Tags are user-owned labels attached to tasks many-to-many via TaskTag. Tags
 * are created implicitly when typed into a task's tag input (connectOrCreate in
 * createTask/updateTask); these actions cover reading them for the filter UI and
 * deleting one globally.
 */

export async function getTags() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  try {
    return await prisma.tag.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    })
  } catch (error) {
    return []
  }
}

export async function deleteTag(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const existing = await prisma.tag.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return { error: "Tag not found" }
    }

    // Cascades the TaskTag join rows; tasks themselves are untouched.
    await prisma.tag.delete({ where: { id } })

    revalidatePath("/tasks")

    return { success: true }
  } catch (error) {
    return { error: "Failed to delete tag" }
  }
}
