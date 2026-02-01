/**
 * Unit tests for src/app/actions/auth.ts
 *
 * Tests cover:
 * - logout function calling signOut with correct parameters
 * - logout redirect behavior
 * - Error handling
 */

import { signOut } from "next-auth/react"

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}))

import { logout } from "@/app/actions/auth"

const mockSignOut = signOut as jest.MockedFunction<typeof signOut>

describe("Auth Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("logout", () => {
    it("should call signOut with redirect to /", async () => {
      mockSignOut.mockResolvedValue(undefined)

      await logout()

      expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/" })
    })

    it("should call signOut once", async () => {
      mockSignOut.mockResolvedValue(undefined)

      await logout()

      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it("should handle signOut errors gracefully", async () => {
      const error = new Error("Sign out failed")
      mockSignOut.mockRejectedValue(error)

      // The logout function doesn't catch errors, so it should reject
      await expect(logout()).rejects.toThrow("Sign out failed")
    })

    it("should always use the same redirect path", async () => {
      mockSignOut.mockResolvedValue(undefined)

      await logout()

      const callArgs = mockSignOut.mock.calls[0]
      expect(callArgs[0].redirectTo).toBe("/")
    })
  })
})
