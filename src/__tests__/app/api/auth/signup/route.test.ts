/**
 * Unit tests for src/app/api/auth/signup/route.ts
 *
 * Tests cover:
 * - Successful user signup
 * - Validation errors (email, password, name)
 * - Duplicate user handling
 * - Password hashing
 * - Response status codes
 * - Error handling
 */

// Mock next/server - must be first due to hoisting
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "content-type": "application/json" },
      }),
  },
}))

// Mock bcryptjs
const mockHash = jest.fn()
jest.mock("bcryptjs", () => ({
  hash: (...args: any[]) => mockHash(...args),
}))

// Import route after mocks are set up
import { POST } from "@/app/api/auth/signup/route"

// Type for global mock prisma
declare global {
  // eslint-disable-next-line no-var
  var __mockPrismaClient: {
    user: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
    }
    task: {
      create: jest.Mock
      update: jest.Mock
      delete: jest.Mock
      findMany: jest.Mock
      findFirst: jest.Mock
      findUnique: jest.Mock
    }
    focusSession: {
      create: jest.Mock
      findFirst: jest.Mock
      findMany: jest.Mock
      update: jest.Mock
    }
    $disconnect: jest.Mock
  }
}

// Helper to create a mock request
const createRequest = async (body: any): Promise<Request> => {
  return new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  })
}

describe("Signup API Route", () => {
  // Set up default mock behaviors before each test
  beforeEach(() => {
    jest.clearAllMocks()
    global.__mockPrismaClient.user.findUnique.mockResolvedValue(null)
    global.__mockPrismaClient.user.create.mockResolvedValue({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      password: "hashedpassword"
    })
    mockHash.mockResolvedValue("hashedpassword")
  })

  describe("Successful Signup", () => {
    it("should create a new user with valid data", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "password123",
        name: "Test User"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toBe("User created successfully")
      expect(data.userId).toBe("user-123")
      expect(global.__mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" }
      })
      expect(global.__mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          password: "hashedpassword",
          name: "Test User"
        }
      })
      expect(mockHash).toHaveBeenCalledWith("password123", 10)
    })

    it("should create user without name", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toBe("User created successfully")
      expect(global.__mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          password: "hashedpassword",
          name: undefined
        }
      })
    })
  })

  describe("Validation Errors", () => {
    it("should return error for invalid email", async () => {
      const request = await createRequest({
        email: "invalid-email",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
      expect(data.details).toBeDefined()
    })

    it("should return error for missing email", async () => {
      const request = await createRequest({
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
    })

    it("should return error for password less than 6 characters", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "12345"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
      expect(data.details).toBeDefined()
    })

    it("should return error for missing password", async () => {
      const request = await createRequest({
        email: "test@example.com"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
    })

    it("should return error for empty email", async () => {
      const request = await createRequest({
        email: "",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
    })

    it("should return error for empty password", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: ""
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Invalid input")
    })

    it("should include validation details in response", async () => {
      const request = await createRequest({
        email: "not-an-email",
        password: "123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(Array.isArray(data.details)).toBe(true)
      expect(data.details.length).toBeGreaterThan(0)
    })
  })

  describe("Duplicate User Handling", () => {
    it("should return error when user already exists", async () => {
      global.__mockPrismaClient.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email: "existing@example.com",
        name: "Test User",
        password: "hashedpassword"
      })

      const request = await createRequest({
        email: "existing@example.com",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("User already exists")
    })
  })

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      global.__mockPrismaClient.user.create.mockRejectedValueOnce(new Error("Database error"))

      const request = await createRequest({
        email: "test@example.com",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("Internal server error")
    })

    it("should return 500 on hash error", async () => {
      mockHash.mockRejectedValueOnce(new Error("Hash error"))

      const request = await createRequest({
        email: "test@example.com",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("Internal server error")
    })

    it("should handle malformed JSON", async () => {
      const request = new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        body: "invalid json"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("Internal server error")
    })
  })

  describe("Response Format", () => {
    it("should return JSON response", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "password123"
      })

      const response = await POST(request)

      expect(response.headers.get("content-type")).toContain("application/json")
    })

    it("should return success message", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "password123"
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toBe("User created successfully")
    })
  })

  describe("Edge Cases", () => {
    it("should handle very long email", async () => {
      const longEmail = "a".repeat(100) + "@example.com"
      const request = await createRequest({
        email: longEmail,
        password: "password123"
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it("should handle very long name", async () => {
      const longName = "a".repeat(200)
      const request = await createRequest({
        email: "test@example.com",
        password: "password123",
        name: longName
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it("should handle very long password", async () => {
      const longPassword = "a".repeat(100)
      const request = await createRequest({
        email: "test@example.com",
        password: longPassword
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it("should handle special characters in name", async () => {
      const request = await createRequest({
        email: "test@example.com",
        password: "password123",
        name: "José María García-López"
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it("should handle email with subdomains", async () => {
      const request = await createRequest({
        email: "user@mail.example.co.uk",
        password: "password123"
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
    })
  })
})
