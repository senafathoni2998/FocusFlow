/**
 * Unit tests for src/app/api/reminders/due/route.ts
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((data: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => data,
    })),
  },
}))
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/app/actions/reminders", () => ({ getDueReminders: jest.fn() }))

import { GET } from "@/app/api/reminders/due/route"
import { auth } from "@/lib/auth"
import { getDueReminders } from "@/app/actions/reminders"

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockGetDue = getDueReminders as jest.MockedFunction<typeof getDueReminders>

describe("GET /api/reminders/due", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockGetDue).not.toHaveBeenCalled()
  })

  it("returns the due reminders when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as any)
    mockGetDue.mockResolvedValue([{ id: "r1" }] as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reminders).toEqual([{ id: "r1" }])
  })
})
