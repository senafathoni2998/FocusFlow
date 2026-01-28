"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { z } from "zod"

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().optional()
})

export async function createTask(data: {
  title: string
  description?: string
  priority?: string
  dueDate?: string
}) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const validated = taskSchema.parse({
      title: data.title,
      description: data.description,
      priority: data.priority || "medium",
      dueDate: data.dueDate
    })

    const task = await prisma.task.create({
      data: {
        ...validated,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
        userId: session.user.id
      }
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")

    return { success: true, task }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Invalid input", details: error.errors }
    }
    return { error: "Failed to create task" }
  }
}

export async function updateTask(
  id: string,
  data: {
    title?: string
    description?: string
    status?: string
    priority?: string
    dueDate?: string
  }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify task ownership
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id }
    })

    if (!existingTask) {
      return { error: "Task not found" }
    }

    const updateData: any = {}
    if (data.title) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.status) updateData.status = data.status
    if (data.priority) updateData.priority = data.priority
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")

    return { success: true, task }
  } catch (error) {
    return { error: "Failed to update task" }
  }
}

export async function deleteTask(id: string) {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify task ownership
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id }
    })

    if (!existingTask) {
      return { error: "Task not found" }
    }

    await prisma.task.delete({
      where: { id }
    })

    revalidatePath("/tasks")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (error) {
    return { error: "Failed to delete task" }
  }
}

export async function getTasks() {
  const session = await auth()

  if (!session?.user?.id) {
    return []
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" }
    })

    return tasks
  } catch (error) {
    return []
  }
}
