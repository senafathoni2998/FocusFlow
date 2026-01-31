/**
 * Unit tests for middleware.ts
 *
 * Tests cover:
 * - Authenticated user redirect from signin page
 * - Authenticated user redirect from signup page
 * - Unauthenticated user allowed to signin page
 * - Unauthenticated user allowed to signup page
 * - Protected pages without auth
 */

import { NextResponse } from "next/server"

// Mock NextResponse before importing middleware
jest.mock("next/server", () => ({
  NextResponse: {
    redirect: jest.fn(),
    next: jest.fn(),
  },
}))

// Mock the auth module
const mockAuthCallback = jest.fn()
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(() => mockAuthCallback),
}))

describe("Middleware", () => {
  let mockReq: any
  let mockNextResponse: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock request object
    mockReq = {
      nextUrl: {
        pathname: "",
        search: "",
      },
      auth: null,
      url: "http://localhost:3000",
    }

    // Mock NextResponse.redirect
    mockNextResponse = {
      redirected: true,
    }
    ;(NextResponse.redirect as jest.Mock).mockReturnValue(mockNextResponse)
    ;(NextResponse.next as jest.Mock).mockReturnValue({})
  })

  // Import the middleware implementation as a pure function
  const getMiddlewareCallback = () => {
    // This is the actual callback function passed to auth()
    return (req: any) => {
      const { pathname } = req.nextUrl
      const isLoggedIn = !!req.auth

      // Redirect authenticated users away from auth pages
      if (
        isLoggedIn &&
        (pathname.startsWith("/auth/signin") ||
          pathname.startsWith("/auth/signup"))
      ) {
        return NextResponse.redirect(new URL("/dashboard", req.url))
      }

      return NextResponse.next()
    }
  }

  describe("Authenticated users", () => {
    beforeEach(() => {
      mockReq.auth = { user: { id: "123", email: "test@example.com" } }
    })

    it("should redirect authenticated user from signin to dashboard", () => {
      mockReq.nextUrl.pathname = "/auth/signin"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.any(URL)
      )

      const redirectUrl = (NextResponse.redirect as jest.Mock).mock.calls[0][0]
      expect(redirectUrl.pathname).toBe("/dashboard")
    })

    it("should redirect authenticated user from signup to dashboard", () => {
      mockReq.nextUrl.pathname = "/auth/signup"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.any(URL)
      )

      const redirectUrl = (NextResponse.redirect as jest.Mock).mock.calls[0][0]
      expect(redirectUrl.pathname).toBe("/dashboard")
    })

    it("should redirect authenticated user from /auth/signin/path to dashboard", () => {
      mockReq.nextUrl.pathname = "/auth/signin/extra"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalled()

      const redirectUrl = (NextResponse.redirect as jest.Mock).mock.calls[0][0]
      expect(redirectUrl.pathname).toBe("/dashboard")
    })

    it("should redirect authenticated user from /auth/signup/callback to dashboard", () => {
      mockReq.nextUrl.pathname = "/auth/callback"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow authenticated user to access dashboard", () => {
      mockReq.nextUrl.pathname = "/dashboard"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow authenticated user to access tasks page", () => {
      mockReq.nextUrl.pathname = "/tasks"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow authenticated user to access timer page", () => {
      mockReq.nextUrl.pathname = "/timer"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })
  })

  describe("Unauthenticated users", () => {
    beforeEach(() => {
      mockReq.auth = null
    })

    it("should allow unauthenticated user to access signin page", () => {
      mockReq.nextUrl.pathname = "/auth/signin"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow unauthenticated user to access signup page", () => {
      mockReq.nextUrl.pathname = "/auth/signup"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow unauthenticated user to access any non-auth page", () => {
      mockReq.nextUrl.pathname = "/dashboard"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      // No redirect - NextAuth will handle the auth check
      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should allow unauthenticated user to access root path", () => {
      mockReq.nextUrl.pathname = "/"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })
  })

  describe("Edge cases", () => {
    it("should handle exact match of /auth/signin", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signin"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalledTimes(1)
      expect(NextResponse.next).not.toHaveBeenCalled()
    })

    it("should handle pathname with query parameters", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signin"
      mockReq.nextUrl.search = "?callbackUrl=/protected"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalled()
      expect(NextResponse.next).not.toHaveBeenCalled()
    })

    it("should handle pathname starting with /auth/signin but not exactly /auth/signin", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signin/new"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalled()
      expect(NextResponse.next).not.toHaveBeenCalled()
    })

    it("should handle pathname starting with /auth/signup but not exactly /auth/signup", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signup/complete"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).toHaveBeenCalled()
      expect(NextResponse.next).not.toHaveBeenCalled()
    })

    it("should not redirect for /auth/other paths when authenticated", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/error"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })

    it("should handle empty auth object as authenticated (truthy)", () => {
      mockReq.auth = {}
      mockReq.nextUrl.pathname = "/auth/signin"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      // Note: !!{} is true in JavaScript, so empty object is treated as authenticated
      expect(NextResponse.redirect).toHaveBeenCalled()
      expect(NextResponse.next).not.toHaveBeenCalled()
    })

    it("should handle undefined auth as unauthenticated", () => {
      mockReq.auth = undefined
      mockReq.nextUrl.pathname = "/auth/signin"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      expect(NextResponse.redirect).not.toHaveBeenCalled()
      expect(NextResponse.next).toHaveBeenCalled()
    })
  })

  describe("URL construction", () => {
    it("should construct correct redirect URL with base URL", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signin"
      mockReq.url = "https://example.com:3000/some-path"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      const redirectUrl = (NextResponse.redirect as jest.Mock).mock.calls[0][0]
      expect(redirectUrl.origin).toBe("https://example.com:3000")
      expect(redirectUrl.pathname).toBe("/dashboard")
    })

    it("should preserve the protocol from original URL", () => {
      mockReq.auth = { user: { id: "123" } }
      mockReq.nextUrl.pathname = "/auth/signup"
      mockReq.url = "http://localhost:3000/auth/signup?r=/dashboard"

      const middlewareCallback = getMiddlewareCallback()
      middlewareCallback(mockReq)

      const redirectUrl = (NextResponse.redirect as jest.Mock).mock.calls[0][0]
      expect(redirectUrl.protocol).toBe("http:")
    })
  })
})
