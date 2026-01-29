"use client"

import { useEffect } from "react"
import { listenToTaskUpdates, TaskEventData } from "@/lib/taskEvents"

/**
 * Hook to trigger a callback when tasks are updated
 * Use this to refresh component data when AI performs task operations
 */
export function useTaskUpdates(callback: (data: TaskEventData) => void, deps: any[] = []) {
  useEffect(() => {
    const cleanup = listenToTaskUpdates(callback)
    return cleanup
  }, deps)
}
