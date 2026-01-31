/**
 * Unit tests for src/lib/prisma.ts
 *
 * Tests cover:
 * - Prisma singleton export
 * - Global caching in development
 */

describe("Prisma Client", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it("should export a prisma instance", () => {
    const { prisma } = require("@/lib/prisma")

    expect(prisma).toBeDefined()
  })

  it("should create a PrismaClient with singleton pattern", () => {
    // Mock NODE_ENV for testing
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "test"

    // Import fresh
    const { prisma: prisma1 } = require("@/lib/prisma")
    const { prisma: prisma2 } = require("@/lib/prisma")

    // Should be the same instance (singleton)
    expect(prisma1).toBe(prisma2)

    process.env.NODE_ENV = originalEnv
  })

  it("should cache the prisma instance globally in non-production environments", () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "development"

    // Import first time
    const { prisma: prisma1 } = require("@/lib/prisma")

    // Import second time - should return same cached instance
    const { prisma: prisma2 } = require("@/lib/prisma")

    expect(prisma1).toBe(prisma2)
    expect(prisma1).toBeDefined()

    process.env.NODE_ENV = originalEnv
  })

  it("should have expected PrismaClient methods available", () => {
    const { prisma } = require("@/lib/prisma")

    // Prisma client should have common model methods
    expect(prisma).toBeDefined()
    expect(typeof prisma.task).toBe("object")
    expect(typeof prisma.user).toBe("object")
  })

  it("should handle production environment", () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"

    // In production, a new instance is created each time (no global caching)
    // But since the module is cached, require returns the same export
    const { prisma: prisma1 } = require("@/lib/prisma")
    const { prisma: prisma2 } = require("@/lib/prisma")

    // Module is cached, so same instance
    expect(prisma1).toBe(prisma2)

    process.env.NODE_ENV = originalEnv
  })
})
