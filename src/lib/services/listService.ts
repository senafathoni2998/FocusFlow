import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notFound, badRequest } from "@/lib/apiResponse"

/** List CRUD for the mobile API — mirrors `src/app/actions/lists.ts`. */

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(30).optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(30).nullable().optional(),
})

export async function getLists(userId: string) {
  return prisma.list.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  })
}

export async function createList(userId: string, input: unknown) {
  const v = createSchema.parse(input)
  const maxOrder = await prisma.list.aggregate({ where: { userId }, _max: { order: true } })
  return prisma.list.create({
    data: { name: v.name, color: v.color, order: (maxOrder._max.order ?? 0) + 10, userId },
  })
}

export async function updateList(userId: string, id: string, input: unknown) {
  const v = updateSchema.parse(input)
  const existing = await prisma.list.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("List not found")

  const data: Record<string, unknown> = {}
  if (v.name !== undefined) {
    const name = v.name.trim()
    if (!name) throw badRequest("List name is required")
    data.name = name
  }
  if (v.color !== undefined) data.color = v.color

  return prisma.list.update({ where: { id }, data })
}

export async function deleteList(userId: string, id: string) {
  const existing = await prisma.list.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("List not found")
  // onDelete: SetNull re-parents this list's tasks to the Inbox.
  await prisma.list.delete({ where: { id } })
  return { success: true }
}

export async function reorderList(userId: string, id: string, newOrder: number) {
  const existing = await prisma.list.findFirst({ where: { id, userId } })
  if (!existing) throw notFound("List not found")
  return prisma.list.update({ where: { id }, data: { order: newOrder } })
}
