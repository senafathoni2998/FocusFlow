import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateInsights } from "@/lib/zai"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Fetch recent sessions and tasks
    const sessions = await prisma.focusSession.findMany({
      where: { userId: session.user.id },
      orderBy: { startTime: "desc" },
      take: 50
    })

    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" }
    })

    const result = await generateInsights(sessions, tasks)

    return NextResponse.json(result)
  } catch (error) {
    console.error("AI insights error:", error)
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    )
  }
}
