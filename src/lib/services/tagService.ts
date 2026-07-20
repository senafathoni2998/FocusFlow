import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound } from "@/lib/apiResponse"

/**
 * Tag reads + delete for the mobile API — mirrors `src/app/actions/tags.ts`. Tags
 * are created implicitly when typed onto a task (connectOrCreate in taskService),
 * so there is no standalone create; `updateTag` (rename/recolor) is a mobile-only
 * convenience.
 */

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(30).nullable().optional(),
})

export async function getTags(userId: string) {
  return prisma.tag.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  })
}

export async function updateTag(userId: string, id: string, input: unknown) {
  const v = updateSchema.parse(input)
  const existing = await prisma.tag.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Tag not found")

  const data: Record<string, unknown> = {}
  if (v.name !== undefined) data.name = v.name.trim()
  if (v.color !== undefined) data.color = v.color

  return prisma.tag.update({ where: { id }, data })
}

export async function deleteTag(userId: string, id: string) {
  const existing = await prisma.tag.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Tag not found")
  // Cascades the TaskTag join rows; tasks themselves are untouched.
  await prisma.tag.delete({ where: { id } })
  return { success: true }
}
