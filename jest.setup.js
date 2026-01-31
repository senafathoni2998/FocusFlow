import { PrismaClient } from '@prisma/client'
import '@testing-library/jest-dom'

// Polyfill for fetch in jsdom
global.fetch = jest.fn()

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

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}))

// Mock React for hook testing - don't override actual React
jest.mock('react', () => jest.requireActual('react'))


// Mock NextAuth auth function
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))
