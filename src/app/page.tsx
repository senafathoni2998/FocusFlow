import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()

  // Redirect to dashboard if already logged in
  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-6xl font-bold text-center mb-8 text-primary-600">
          FocusFlow
        </h1>
        <p className="text-center text-xl text-gray-600 mb-12">
          Your productivity companion for task management and focused work
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/auth/signin"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Sign Up
          </a>
        </div>
      </div>
    </main>
  );
}
