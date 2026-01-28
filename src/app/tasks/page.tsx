import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getTasks } from "@/app/actions/tasks"
import TaskBoard from "@/components/tasks/TaskBoard"

export default async function TasksPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const tasks = await getTasks()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TaskBoard tasks={tasks} />
      </div>
    </main>
  )
}
