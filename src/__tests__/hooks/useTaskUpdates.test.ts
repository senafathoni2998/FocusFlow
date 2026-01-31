/**
 * Unit tests for src/hooks/useTaskUpdates.ts
 *
 * Tests cover:
 * - useTaskUpdates hook functionality
 * - Event listener registration
 * - Cleanup on unmount
 * - Callback invocation
 */

import { renderHook } from "@testing-library/react"
import { useTaskUpdates } from "@/hooks/useTaskUpdates"
import { listenToTaskUpdates } from "@/lib/taskEvents"

// Mock the taskEvents module
jest.mock("@/lib/taskEvents", () => ({
  listenToTaskUpdates: jest.fn(),
}))

describe("useTaskUpdates Hook", () => {
  let mockListenToTaskUpdates: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    mockListenToTaskUpdates = listenToTaskUpdates as jest.Mock
    mockListenToTaskUpdates.mockReturnValue(() => jest.fn())
  })

  it("should register a listener on mount", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback))

    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(1)
    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })

  it("should use default empty array for dependencies", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback))

    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })

  it("should call cleanup on unmount", () => {
    const cleanup = jest.fn()
    mockListenToTaskUpdates.mockReturnValue(cleanup)

    const { unmount } = renderHook(() => useTaskUpdates(() => {}))

    unmount()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it("should pass callback to listenToTaskUpdates", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback))

    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })

  it("should handle empty dependencies array", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback, []))

    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })

  it("should handle custom dependencies", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback, [1, 2, 3]))

    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })

  it("should clean up previous listener when deps change", () => {
    const cleanup1 = jest.fn()
    const cleanup2 = jest.fn()

    mockListenToTaskUpdates
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2)

    const { rerender } = renderHook(
      ({ deps }) => useTaskUpdates(() => {}, deps),
      {
        initialProps: { deps: ["dep1"] }
      }
    )

    // Rerender to trigger cleanup and new registration
    rerender({ deps: ["dep2"] })

    expect(cleanup1).toHaveBeenCalledTimes(1)
    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(2)
  })

  it("should allow multiple hooks with different callbacks", () => {
    const callback1 = jest.fn()
    const callback2 = jest.fn()

    renderHook(() => {
      useTaskUpdates(callback1, [])
      useTaskUpdates(callback2, [])
    })

    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(2)
    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback1)
    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback2)
  })

  it("should not re-register when deps stay the same", () => {
    const { rerender } = renderHook(
      ({ deps }) => useTaskUpdates(() => {}, deps),
      {
        initialProps: { deps: [1] }
      }
    )

    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(1)

    // Rerender with same deps - useEffect should not re-run
    rerender({ deps: [1] })

    // With same deps, useEffect shouldn't re-run
    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(1)
  })

  it("should re-register when deps change", () => {
    const cleanup1 = jest.fn()
    const cleanup2 = jest.fn()

    mockListenToTaskUpdates
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2)

    const { rerender } = renderHook(
      ({ deps }) => useTaskUpdates(() => {}, deps),
      {
        initialProps: { deps: [1] }
      }
    )

    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(1)

    rerender({ deps: [2] })

    expect(mockListenToTaskUpdates).toHaveBeenCalledTimes(2)
    expect(cleanup1).toHaveBeenCalledTimes(1)
  })

  it("should work with function callbacks in deps", () => {
    const callback = jest.fn()

    renderHook(() => useTaskUpdates(callback, [callback]))

    expect(mockListenToTaskUpdates).toHaveBeenCalledWith(callback)
  })
})
