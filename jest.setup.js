import { PrismaClient } from '@prisma/client'

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    task: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $disconnect: jest.fn(),
  }
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  }
})

// Mock NextAuth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
}))

// Mock NextAuth auth function
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))
