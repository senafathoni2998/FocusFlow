"use client"

import { useRouter } from "next/navigation"
import { useTaskUpdates } from "./useTaskUpdates"

/**
 * Hook that refreshes the router when tasks are updated
 * Use this in client components to trigger server component refreshes
 */
export function useRefreshOnTaskUpdate() {
  const router = useRouter()

  useTaskUpdates(() => {
    // Refresh the router to update all server components
    router.refresh()
  }, [router])
}
