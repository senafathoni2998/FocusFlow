import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getAISettings } from "@/app/actions/settings"
import AISettingsForm from "@/components/settings/AISettingsForm"

export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const settings = await getAISettings()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-gray-500 mb-6">
          Choose which AI provider powers your assistant and insights.
        </p>
        <AISettingsForm settings={settings} />
      </div>
    </main>
  )
}
