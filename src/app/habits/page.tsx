import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getHabits } from "@/app/actions/habits"
import HabitBoard from "@/components/habits/HabitBoard"

export default async function HabitsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const habits = await getHabits()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HabitBoard habits={habits} />
      </div>
    </main>
  )
}
