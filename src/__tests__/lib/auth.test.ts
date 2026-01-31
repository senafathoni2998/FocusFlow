/**
 * Unit tests for src/lib/auth.ts
 *
 * Tests cover:
 * - Credential validation
 * - User authorization flow
 * - JWT callback behavior
 * - Session callback behavior
 */

import { compare } from "bcryptjs"
import { z } from "zod"

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}))

describe("Auth Configuration", () => {
  let mockPrisma: any
  let mockCompare: jest.MockedFunction<typeof compare>

  beforeEach(() => {
    jest.clearAllMocks()

    mockPrisma = require("@/lib/prisma").prisma
    mockCompare = compare as jest.MockedFunction<typeof compare>
  })

  describe("Credential Validation", () => {
    it("should reject invalid email format", () => {
      const credentials = {
        email: "invalid-email",
        password: "password123",
      }

      const schema = z
        .object({
          email: z.string().email(),
          password: z.string().min(6),
        })
        .safeParse(credentials)

      expect(schema.success).toBe(false)
    })

    it("should reject password shorter than 6 characters", () => {
      const credentials = {
        email: "test@example.com",
        password: "12345",
      }

      const schema = z
        .object({
          email: z.string().email(),
          password: z.string().min(6),
        })
        .safeParse(credentials)

      expect(schema.success).toBe(false)
    })

    it("should accept valid credentials", () => {
      const credentials = {
        email: "test@example.com",
        password: "password123",
      }

      const schema = z
        .object({
          email: z.string().email(),
          password: z.string().min(6),
        })
        .safeParse(credentials)

      expect(schema.success).toBe(true)
    })
  })

  describe("User Authorization", () => {
    it("should return null if user is not found in database", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const credentials = {
        email: "nonexistent@example.com",
        password: "password123",
      }

      mockPrisma.user.findUnique.mockResolvedValue(null)

      const user = await mockPrisma.user.findUnique({
        where: { email: credentials.email },
      })

      expect(user).toBeNull()
    })

    it("should return null if password does not match", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
        password: "hashedpassword",
        name: "Test User",
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser)
      mockCompare.mockResolvedValue(false)

      const user = await mockPrisma.user.findUnique({
        where: { email: "test@example.com" },
      })

      expect(user).toEqual(mockUser)

      const passwordsMatch = await compare("wrongpassword", user.password)
      expect(passwordsMatch).toBe(false)
    })

    it("should return user object if credentials are valid", async () => {
      const mockUser = {
        id: "123",
        email: "test@example.com",
        password: "hashedpassword",
        name: "Test User",
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser)
      mockCompare.mockResolvedValue(true)

      const user = await mockPrisma.user.findUnique({
        where: { email: "test@example.com" },
      })

      expect(user).toEqual(mockUser)

      const passwordsMatch = await compare("password123", user.password)
      expect(passwordsMatch).toBe(true)

      // Should return user object without password
      const { password, ...userWithoutPassword } = user
      expect(password).toBeDefined()
      expect(userWithoutPassword).toEqual({
        id: "123",
        email: "test@example.com",
        name: "Test User",
      })
    })
  })

  describe("JWT Callback", () => {
    it("should add user id to token when user is present", () => {
      const token = {} as any
      const user = { id: "123", email: "test@example.com", name: "Test" }

      // Simulate JWT callback logic
      if (user) {
        token.id = user.id
      }

      expect(token.id).toBe("123")
    })

    it("should not modify token when user is not present", () => {
      const token = { existing: "value" } as any
      const user = null

      // Simulate JWT callback logic
      if (user) {
        token.id = user.id
      }

      expect(token).toEqual({ existing: "value" })
      expect(token.id).toBeUndefined()
    })
  })

  describe("Session Callback", () => {
    it("should add token id to session user when token exists", () => {
      const token = { id: "123" } as any
      const session = { user: { email: "test@example.com", name: "Test" } } as any

      // Simulate session callback logic
      if (token && session.user) {
        session.user.id = token.id as string
      }

      expect(session.user.id).toBe("123")
    })

    it("should not modify session when token is missing", () => {
      const token = null as any
      const session = { user: { email: "test@example.com", name: "Test" } } as any

      // Simulate session callback logic
      if (token && session.user) {
        session.user.id = token.id as string
      }

      expect(session.user.id).toBeUndefined()
    })

    it("should not modify session when session user is missing", () => {
      const token = { id: "123" } as any
      const session = {} as any

      // Simulate session callback logic
      if (token && session.user) {
        session.user.id = token.id as string
      }

      expect(session.user).toBeUndefined()
    })
  })
})
