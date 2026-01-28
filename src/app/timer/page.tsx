import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PomodoroTimer from "@/components/timer/PomodoroTimer"

export default async function TimerPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PomodoroTimer />
      </div>
    </main>
  )
}
