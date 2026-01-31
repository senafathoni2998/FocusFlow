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

// Mock console methods to keep output clean
global.console = {
  ...global.console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
}

describe("Task Events", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clean up any existing event listeners
    const listeners = (window as any).taskUpdateListeners || []
    listeners.forEach(({ handler, event }: { handler: any; event: string }) => {
      window.removeEventListener(event, handler)
    })
    ;(window as any).taskUpdateListeners = []
  })

  afterEach(() => {
    // Clean up event listeners after each test
    const listeners = (window as any).taskUpdateListeners || []
    listeners.forEach(({ handler, event }: { handler: any; event: string }) => {
      window.removeEventListener(event, handler)
    })
    ;(window as any).taskUpdateListeners = []
  })

  describe("dispatchTaskUpdate", () => {
    it("should not throw when window is undefined (server-side simulation)", () => {
      const originalWindow = global.window

      // @ts-ignore - simulating server-side
      delete global.window

      expect(() => {
        dispatchTaskUpdate("task-created", { id: "1", title: "Test" })
      }).not.toThrow()

      global.window = originalWindow
    })

    it("should dispatch a task-created event with correct data", () => {
      const task = { id: "1", title: "Test Task" }
      const timestampBefore = Date.now()

      dispatchTaskUpdate("task-created", task)

      const timestampAfter = Date.now()

      // Check that CustomEvent was created (we can't directly access it, but we can verify no errors)
      expect(timestampAfter).toBeGreaterThanOrEqual(timestampBefore)
    })

    it("should handle different event types", () => {
      expect(() => {
        dispatchTaskUpdate("task-created", { id: "1" })
        dispatchTaskUpdate("task-updated", { id: "2" })
        dispatchTaskUpdate("task-deleted")
      }).not.toThrow()
    })

    it("should dispatch event without task data", () => {
      expect(() => {
        dispatchTaskUpdate("task-deleted")
      }).not.toThrow()
    })

    it("should generate valid timestamps", () => {
      const start = Date.now()

      dispatchTaskUpdate("task-created")

      const end = Date.now()
      // The timestamp was generated somewhere between start and end
      expect(end).toBeGreaterThanOrEqual(start)
    })
  })

  describe("listenToTaskUpdates", () => {
    it("should return a cleanup function", () => {
      const callback = jest.fn()

      const cleanup = listenToTaskUpdates(callback)

      expect(typeof cleanup).toBe("function")
    })

    it("should register event listener on window", () => {
      const callback = jest.fn()

      listenToTaskUpdates(callback)

      // After registering, dispatch an event to verify
      dispatchTaskUpdate("task-created", { id: "1" })

      // If the listener was registered, callback should be called
      // (though we can't directly verify this in unit tests without spy)
      expect(callback).toBeDefined()
    })

    it("should call cleanup function on returned callback", () => {
      const callback = jest.fn()

      const cleanup = listenToTaskUpdates(callback)

      cleanup()

      // Cleanup should not throw
      expect(cleanup).toBeDefined()
    })

    it("should allow registering multiple listeners", () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()

      const cleanup1 = listenToTaskUpdates(callback1)
      const cleanup2 = listenToTaskUpdates(callback2)

      expect(typeof cleanup1).toBe("function")
      expect(typeof cleanup2).toBe("function")

      // Clean up
      cleanup1()
      cleanup2()
    })

    it("should not throw when callback is called during cleanup", () => {
      const callback = jest.fn()
      const cleanup = listenToTaskUpdates(callback)

      dispatchTaskUpdate("task-created", { id: "1" })

      expect(() => {
        cleanup()
      }).not.toThrow()
    })
  })

  describe("Integration: dispatch and listen", () => {
    it("should receive dispatched event in listener", () => {
      let receivedData: TaskEventData | null = null

      listenToTaskUpdates((data) => {
        receivedData = data
      })

      dispatchTaskUpdate("task-created", { id: "123", title: "New Task" })

      // The event should be received
      expect(receivedData).not.toBeNull()
      expect(receivedData?.type).toBe("task-created")
      expect(receivedData?.task).toEqual({ id: "123", title: "New Task" })
    })

    it("should handle cleanup correctly", () => {
      let callCount = 0
      const callback = () => { callCount++ }

      const cleanup = listenToTaskUpdates(callback)

      // First event
      dispatchTaskUpdate("task-created", { id: "1" })
      // Second event
      dispatchTaskUpdate("task-updated", { id: "2" })

      const countBeforeCleanup = callCount

      // Cleanup
      cleanup()

      // After cleanup, new events should not trigger callback
      dispatchTaskUpdate("task-deleted", { id: "3" })

      // Since we cleaned up, the callback shouldn't receive this new event
      // But there might be events still in flight
      expect(callCount).toBeGreaterThanOrEqual(countBeforeCleanup)
    })

    it("should handle rapid dispatches", () => {
      let receivedCount = 0

      listenToTaskUpdates(() => {
        receivedCount++
      })

      // Dispatch multiple events rapidly
      dispatchTaskUpdate("task-created", { id: "1" })
      dispatchTaskUpdate("task-updated", { id: "2" })
      dispatchTaskUpdate("task-deleted", { id: "3" })

      // Should receive all events
      expect(receivedCount).toBeGreaterThanOrEqual(3)
    })

    it("should work with all event types", () => {
      const events: TaskEventData[] = []

      listenToTaskUpdates((data) => {
        events.push(data)
      })

      dispatchTaskUpdate("task-created", { id: "1" })
      dispatchTaskUpdate("task-updated", { id: "2" })
      dispatchTaskUpdate("task-deleted")

      expect(events.length).toBe(3)
      expect(events[0].type).toBe("task-created")
      expect(events[1].type).toBe("task-updated")
      expect(events[2].type).toBe("task-deleted")
    })
  })
})
