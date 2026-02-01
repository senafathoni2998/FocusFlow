import '@testing-library/jest-dom'

// Polyfill for fetch in jsdom
global.fetch = jest.fn()

// Polyfill for Request API in jsdom
global.Request = class Request {
  constructor(url, init) {
    this.url = url
    this.method = init?.method || 'GET'
    this._headers = new Headers(init?.headers || {})
    this.body = init?.body
    this._bodyUsed = false
  }

  get headers() {
    return this._headers
  }

  async json() {
    if (this._bodyUsed) {
      throw new TypeError('body used already for: ' + this.url)
    }
    this._bodyUsed = true
    if (typeof this.body === 'string') {
      return JSON.parse(this.body)
    }
    return this.body
  }

  async text() {
    if (this._bodyUsed) {
      throw new TypeError('body used already for: ' + this.url)
    }
    this._bodyUsed = true
    return typeof this.body === 'string' ? this.body : JSON.stringify(this.body)
  }

  get bodyUsed() {
    return this._bodyUsed
  }
}

// Polyfill for Response API in jsdom
global.Response = class Response {
  constructor(body, init) {
    this._body = body
    this.status = init?.status || 200
    this.statusText = init?.statusText || 'OK'
    this._headers = new Headers(init?.headers || {})
    this._bodyUsed = false
  }
  _body
  status
  statusText
  _bodyUsed

  get headers() {
    return this._headers
  }

  async json() {
    if (this._bodyUsed) {
      throw new TypeError('body used already')
    }
    this._bodyUsed = true
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body
  }

  async text() {
    if (this._bodyUsed) {
      throw new TypeError('body used already')
    }
    this._bodyUsed = true
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body)
  }

  get bodyUsed() {
    return this._bodyUsed
  }
}

// Create singleton mock Prisma instance (for backwards compatibility)
// Note: Test files may override these mocks with their own
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
  focusSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $disconnect: jest.fn(),
}

// Make prisma mock available globally for test files to access
global.__mockPrismaClient = mockPrismaClient

// Mock Prisma BEFORE any imports from @prisma/client
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  }
})

// Mock @/lib/prisma to use the same mock client
jest.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}))

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
