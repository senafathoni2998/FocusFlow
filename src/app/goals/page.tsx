import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getGoals } from "@/app/actions/goals"
import GoalBoard from "@/components/goals/GoalBoard"

export default async function GoalsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const goals = await getGoals()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <GoalBoard goals={goals} />
      </div>
    </main>
  )
}
