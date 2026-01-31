/**
 * Unit tests for src/lib/taskEvents.ts
 *
 * Tests cover:
 * - dispatchTaskUpdate function
 * - listenToTaskUpdates function
 * - Event listener cleanup
 * - Different event types
 */

import { dispatchTaskUpdate, listenToTaskUpdates, TaskEventData } from "@/lib/taskEvents"

// Mock window object for tests
const mockWindow = {
  dispatchEvent: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}

describe("Task Events", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("dispatchTaskUpdate", () => {
    it("should not dispatch when window is undefined (server-side)", () => {
      const originalWindow = global.window
      // @ts-ignore - simulating server-side
      delete global.window

      dispatchTaskUpdate("task-created", { id: "1", title: "Test" })

      // Should not throw
      expect(true).toBe(true)

      global.window = originalWindow
    })

    it("should dispatch a task-created event with correct data", () => {
      global.window = mockWindow as any

      const task = { id: "1", title: "Test Task" }
      const timestampBefore = Date.now()

      dispatchTaskUpdate("task-created", task)

      const timestampAfter = Date.now()

      expect(mockWindow.dispatchEvent).toHaveBeenCalledTimes(1)

      const event = (mockWindow.dispatchEvent.mock.calls[0][0] as CustomEvent<TaskEventData>)
      expect(event.detail.type).toBe("task-created")
      expect(event.detail.task).toEqual(task)
      expect(event.detail.timestamp).toBeGreaterThanOrEqual(timestampBefore)
      expect(event.detail.timestamp).toBeLessThanOrEqual(timestampAfter)
    })

    it("should dispatch a task-updated event", () => {
      global.window = mockWindow as any

      const task = { id: "1", title: "Updated Task" }

      dispatchTaskUpdate("task-updated", task)

      const event = (mockWindow.dispatchEvent.mock.calls[0][0] as CustomEvent<TaskEventData>)
      expect(event.detail.type).toBe("task-updated")
      expect(event.detail.task).toEqual(task)
    })

    it("should dispatch a task-deleted event", () => {
      global.window = mockWindow as any

      dispatchTaskUpdate("task-deleted", { id: "1" })

      const event = (mockWindow.dispatchEvent.mock.calls[0][0] as CustomEvent<TaskEventData>)
      expect(event.detail.type).toBe("task-deleted")
    })

    it("should dispatch event without task data", () => {
      global.window = mockWindow as any

      dispatchTaskUpdate("task-deleted")

      const event = (mockWindow.dispatchEvent.mock.calls[0][0] as CustomEvent<TaskEventData>)
      expect(event.detail.task).toBeUndefined()
      expect(event.detail.type).toBe("task-deleted")
    })
  })

  describe("listenToTaskUpdates", () => {
    it("should return a no-op function when window is undefined (server-side)", () => {
      const originalWindow = global.window
      // @ts-ignore - simulating server-side
      delete global.window

      const cleanup = listenToTaskUpdates(() => {})

      expect(typeof cleanup).toBe("function")
      cleanup() // Should not throw

      global.window = originalWindow
    })

    it("should register event listener for task updates", () => {
      global.window = mockWindow as any

      const callback = jest.fn()
      listenToTaskUpdates(callback)

      expect(mockWindow.addEventListener).toHaveBeenCalledTimes(1)
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        "task-update",
        expect.any(Function)
      )
    })

    it("should call callback when event is dispatched", () => {
      global.window = mockWindow as any

      const callback = jest.fn()
      listenToTaskUpdates(callback)

      // Get the registered event handler
      const eventHandler = mockWindow.addEventListener.mock.calls[0][1]

      // Simulate event dispatch
      const mockEvent = {
        detail: {
          type: "task-created",
          task: { id: "1", title: "Test" },
          timestamp: Date.now(),
        },
      }
      eventHandler(mockEvent)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(mockEvent.detail)
    })

    it("should return cleanup function that removes event listener", () => {
      global.window = mockWindow as any

      const callback = jest.fn()
      const cleanup = listenToTaskUpdates(callback)

      expect(typeof cleanup).toBe("function")

      cleanup()

      expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1)
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        "task-update",
        expect.any(Function)
      )
    })

    it("should handle multiple event listeners independently", () => {
      global.window = mockWindow as any

      const callback1 = jest.fn()
      const callback2 = jest.fn()

      const cleanup1 = listenToTaskUpdates(callback1)
      const cleanup2 = listenToTaskUpdates(callback2)

      expect(mockWindow.addEventListener).toHaveBeenCalledTimes(2)

      // Cleanup first listener
      cleanup1()

      expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1)
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        "task-update",
        expect.any(Function)
      )

      // Second listener should still be registered
      expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1)
    })
  })

  describe("Integration: dispatch and listen", () => {
    it("should receive dispatched event in listener", () => {
      global.window = mockWindow as any

      let receivedData: TaskEventData | null = null

      listenToTaskUpdates((data) => {
        receivedData = data
      })

      // Get the registered handler
      const eventHandler = mockWindow.addEventListener.mock.calls[0][1]

      // Dispatch an event
      const taskData = { id: "123", title: "New Task", status: "todo" }
      dispatchTaskUpdate("task-created", taskData)

      // Get the dispatched event
      const dispatchedEvent = mockWindow.dispatchEvent.mock.calls[0][0]

      // Simulate the event being received
      eventHandler(dispatchedEvent)

      expect(receivedData).not.toBeNull()
      expect(receivedData?.type).toBe("task-created")
      expect(receivedData?.task).toEqual(taskData)
    })

    it("should handle event cleanup correctly", () => {
      global.window = mockWindow as any

      let callCount = 0
      const callback = () => { callCount++ }

      const cleanup = listenToTaskUpdates(callback)

      // Get the handler
      const eventHandler = mockWindow.addEventListener.mock.calls[0][1]

      // Dispatch first event
      const event1 = { detail: { type: "task-created", task: {}, timestamp: Date.now() } }
      eventHandler(event1)
      expect(callCount).toBe(1)

      // Cleanup - removeEventListener is called but handler function reference still exists
      cleanup()
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        "task-update",
        eventHandler
      )

      // After cleanup, calling the handler directly still works (it's just no longer registered on window)
      // The test verifies that removeEventListener was called with the correct handler
      expect(mockWindow.removeEventListener).toHaveBeenCalledTimes(1)
    })
  })
})
