import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import StatsCards from "@/components/dashboard/StatsCards"
import Charts from "@/components/dashboard/Charts"
import AIInsights from "@/components/dashboard/AIInsights"

async function getAnalytics() {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  try {
    const response = await fetch(`${baseUrl}/api/analytics?days=30`, {
      cache: "no-store"
    })

    if (!response.ok) {
      console.error("Analytics fetch failed:", response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("Analytics fetch error:", error)
    return null
  }
}

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const analytics = await getAnalytics()

  const defaultData = {
    dailyData: [],
    taskStats: { total: 0, todo: 0, inProgress: 0, completed: 0, highPriority: 0, mediumPriority: 0, lowPriority: 0 },
    sessionStats: { total: 0, completed: 0, cancelled: 0, totalMinutes: 0 },
    peakHours: []
  }

  const data = analytics || defaultData

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {session.user.name || session.user.email}!
          </h1>
          <p className="text-gray-600 mt-1">
            Here's your productivity overview
          </p>
        </div>

        <StatsCards taskStats={data.taskStats} sessionStats={data.sessionStats} />

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Charts
              dailyData={data.dailyData}
              taskStats={data.taskStats}
              sessionStats={data.sessionStats}
            />
          </div>

          <div className="lg:col-span-1">
            <AIInsights />
          </div>
        </div>
      </div>
    </main>
  )
}
