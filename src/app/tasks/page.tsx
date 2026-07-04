import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getTasks } from "@/app/actions/tasks"
import TasksWorkspace from "@/components/tasks/TasksWorkspace"

export default async function TasksPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const tasks = await getTasks()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<div className="text-gray-500">Loading tasks…</div>}>
          <TasksWorkspace tasks={tasks} />
        </Suspense>
      </div>
    </main>
  )
}
