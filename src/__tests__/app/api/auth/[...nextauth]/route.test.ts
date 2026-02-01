/**
 * Unit tests for src/app/api/auth/[...nextauth]/route.ts
 *
 * Tests cover:
 * - Handler exports
 * - GET and POST method availability
 */

// Mock the auth library to avoid actual NextAuth initialization
jest.mock("@/lib/auth", () => ({
  handlers: {
    GET: jest.fn((req: Request) => new Response(JSON.stringify({ method: "GET" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })),
    POST: jest.fn((req: Request) => new Response(JSON.stringify({ method: "POST" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }))
  }
}))

import { GET, POST } from "@/app/api/auth/[...nextauth]/route"
import { handlers } from "@/lib/auth"

describe("NextAuth Route Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Handler Exports", () => {
    it("should export GET handler", () => {
      expect(GET).toBeDefined()
      expect(typeof GET).toBe("function")
    })

    it("should export POST handler", () => {
      expect(POST).toBeDefined()
      expect(typeof POST).toBe("function")
    })

    it("should export handlers from lib/auth", () => {
      expect(handlers).toBeDefined()
      expect(handlers.GET).toBeDefined()
      expect(handlers.POST).toBeDefined()
    })
  })

  describe("GET Handler", () => {
    it("should be the same as handlers.GET", () => {
      // The route exports the handlers directly, so they should match
      expect(GET).toBe(handlers.GET)
    })

    it("should be callable", async () => {
      const mockRequest = new Request("http://localhost:3000/api/auth/signin")

      const response = await GET(mockRequest)
      const data = await response.json()

      expect(response).toBeInstanceOf(Response)
      expect(data.method).toBe("GET")
    })
  })

  describe("POST Handler", () => {
    it("should be the same as handlers.POST", () => {
      expect(POST).toBe(handlers.POST)
    })

    it("should be callable", async () => {
      const mockRequest = new Request("http://localhost:3000/api/auth/signin", {
        method: "POST"
      })

      const response = await POST(mockRequest)
      const data = await response.json()

      expect(response).toBeInstanceOf(Response)
      expect(data.method).toBe("POST")
    })
  })

  describe("Handler Behavior", () => {
    it("should handle GET requests for NextAuth", async () => {
      const mockRequest = new Request("http://localhost:3000/api/auth/signin")

      const response = await GET(mockRequest)

      expect(response.status).toBe(200)
    })

    it("should handle POST requests for NextAuth", async () => {
      const mockRequest = new Request("http://localhost:3000/api/auth/callback", {
        method: "POST"
      })

      const response = await POST(mockRequest)

      expect(response.status).toBe(200)
    })
  })

  describe("NextAuth Integration", () => {
    it("should use the handlers from auth configuration", () => {
      // Verify the route is using the configured handlers
      expect(typeof handlers.GET).toBe("function")
      expect(typeof handlers.POST).toBe("function")
    })

    it("should export both HTTP method handlers", () => {
      const exports = { GET, POST }

      expect(exports.GET).toBeDefined()
      expect(exports.POST).toBeDefined()
      expect(Object.keys(exports)).toHaveLength(2)
    })
  })
})
