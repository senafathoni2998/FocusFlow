import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ApiError, badRequest, notFound } from "@/lib/apiResponse"
import { normalizeTagName } from "@/lib/tags"

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
  if (v.name !== undefined) {
    // The schema's .min(1) ran BEFORE this trim, so "   " passed validation and
    // persisted as "", producing a label-less chip that tagCreateInput then filters
    // out — leaving a tag that can never be re-attached.
    const name = normalizeTagName(v.name)
    if (!name) throw badRequest("Tag name cannot be empty")
    data.name = name
  }
  if (v.color !== undefined) data.color = v.color

  try {
    return await prisma.tag.update({ where: { id }, data })
  } catch (e) {
    // @@unique([userId, name]): renaming onto an existing tag is a conflict the
    // caller can act on, not a server fault.
    if ((e as { code?: string })?.code === "P2002") {
      throw new ApiError(409, "You already have a tag with that name")
    }
    throw e
  }
}

export async function deleteTag(userId: string, id: string) {
  const existing = await prisma.tag.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("Tag not found")
  // Cascades the TaskTag join rows; tasks themselves are untouched.
  await prisma.tag.delete({ where: { id } })
  return { success: true }
}
