"use client"

/**
 * Task update event system for real-time UI updates
 * Allows components to listen and react to task changes from AI assistant
 */

export type TaskEventType = "task-created" | "task-updated" | "task-deleted"

export interface TaskEventData {
  type: TaskEventType
  task?: any
  timestamp: number
}

const TASK_UPDATE_EVENT = "task-update"

/**
 * Dispatch a task update event (call this after task operations)
 */
export function dispatchTaskUpdate(type: TaskEventType, task?: any) {
  if (typeof window === "undefined") return

  const event = new CustomEvent<TaskEventData>(TASK_UPDATE_EVENT, {
    detail: {
      type,
      task,
      timestamp: Date.now()
    }
  })

  window.dispatchEvent(event)
}

/**
 * Listen for task update events
 * Returns a cleanup function
 */
export function listenToTaskUpdates(callback: (data: TaskEventData) => void) {
  if (typeof window === "undefined") return () => {}

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<TaskEventData>
    callback(customEvent.detail)
  }

  window.addEventListener(TASK_UPDATE_EVENT, handler)

  return () => {
    window.removeEventListener(TASK_UPDATE_EVENT, handler)
  }
}
