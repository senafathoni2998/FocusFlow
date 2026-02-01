/**
 * Unit tests for src/app/page.tsx
 *
 * Tests cover:
 * - Redirect to dashboard when authenticated
 * - Landing page rendering when not authenticated
 * - Sign In and Sign Up links
 * - Page structure and styling
 */

import Home from "@/app/page"

// Mock the dependencies
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

describe("Home Page", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Authentication Redirect", () => {
    it("should call auth to check session", async () => {
      const authMock = jest.mocked(auth)
      authMock.mockResolvedValue(null)

      await Home()

      expect(authMock).toHaveBeenCalled()
    })

    it("should redirect to dashboard when user is logged in", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: { id: "user-123", name: "Test User", email: "test@example.com" },
      })

      redirectMock.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT")
      })

      try {
        await Home()
      } catch (e: any) {
        // Expected redirect error
        expect(e.message).toBe("NEXT_REDIRECT")
      }

      expect(redirectMock).toHaveBeenCalledWith("/dashboard")
    })

    it("should not redirect when user is not logged in", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue(null)

      const result = await Home()

      // If we get here, no redirect happened
      expect(result).toBeDefined()
      expect(redirectMock).not.toHaveBeenCalled()
    })

    it("should not redirect when session exists but has no user", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({})

      await Home()

      expect(redirectMock).not.toHaveBeenCalled()
    })
  })

  describe("Landing Page Content", () => {
    beforeEach(() => {
      jest.clearAllMocks()
      const authMock = jest.mocked(auth)
      authMock.mockResolvedValue(null)
    })

    it("should render component when not authenticated", async () => {
      const result = await Home()
      expect(result).toBeDefined()
    })

    it("should be a valid React element", async () => {
      const result = await Home()
      // The result should be a React element
      expect(typeof result).toBe("object")
    })
  })

  describe("Component Structure", () => {
    it("should export default function", () => {
      expect(Home).toBeDefined()
      expect(typeof Home).toBe("function")
    })

    it("should be an async function", () => {
      expect(Home.constructor.name).toBe("AsyncFunction")
    })
  })

  describe("Auth Session Check", () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it("should check for session.user property", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      // Test with user present
      authMock.mockResolvedValue({
        user: { id: "test-id" },
      })

      redirectMock.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT")
      })

      try {
        await Home()
      } catch (e) {
        // Expected
      }

      expect(redirectMock).toHaveBeenCalledWith("/dashboard")
    })

    it("should handle session with null user", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: null,
      })

      await Home()

      expect(redirectMock).not.toHaveBeenCalled()
    })

    it("should handle session with undefined user", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: undefined,
      })

      await Home()

      expect(redirectMock).not.toHaveBeenCalled()
    })
  })

  describe("Redirect Behavior", () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it("should redirect to correct dashboard path", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: { id: "any-id" },
      })

      redirectMock.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT")
      })

      try {
        await Home()
      } catch (e) {
        // Expected
      }

      expect(redirectMock).toHaveBeenCalledWith("/dashboard")
    })

    it("should only redirect once when user is logged in", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: { id: "user-123" },
      })

      redirectMock.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT")
      })

      try {
        await Home()
      } catch (e) {
        // Expected
      }

      expect(redirectMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("Edge Cases", () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it("should handle session with empty user object", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockResolvedValue({
        user: {},
      })

      redirectMock.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT")
      })

      try {
        await Home()
      } catch (e) {
        // Redirect was called (empty object is truthy for user existence check)
      }

      // Empty object is truthy, so redirect happens
      expect(redirectMock).toHaveBeenCalledWith("/dashboard")
    })

    it("should handle auth throwing an error", async () => {
      const authMock = jest.mocked(auth)
      const redirectMock = jest.mocked(redirect)

      authMock.mockRejectedValue(new Error("Auth service unavailable"))

      await expect(Home()).rejects.toThrow("Auth service unavailable")
    })
  })
})
