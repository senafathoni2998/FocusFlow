/**
 * @jest-environment node
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body, headers: new Map() }),
  },
}))
jest.mock("@/lib/apiAuth", () => ({ requireApiUser: jest.fn() }))
jest.mock("@/lib/services/authService", () => ({ getMe: jest.fn(), deleteAccount: jest.fn() }))

import { DELETE } from "@/app/api/v1/auth/me/route"
import { requireApiUser } from "@/lib/apiAuth"
import { deleteAccount } from "@/lib/services/authService"
import { ApiError } from "@/lib/apiResponse"

const mockUser = requireApiUser as jest.MockedFunction<typeof requireApiUser>
const mockDelete = deleteAccount as jest.MockedFunction<typeof deleteAccount>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { params: Promise.resolve({}) } as any
const req = (body: string | null) =>
  new Request("http://localhost/api/v1/auth/me", {
    method: "DELETE",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body,
  })

beforeEach(() => {
  jest.resetAllMocks()
  mockUser.mockResolvedValue("u1")
  mockDelete.mockResolvedValue({ success: true })
})

describe("DELETE /api/v1/auth/me", () => {
  it("passes the token's user and the body's password to the service", async () => {
    const res = await DELETE(req(JSON.stringify({ password: "pw" })), ctx)
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledWith("u1", { password: "pw" })
  })

  it("surfaces the service's 401 as an error envelope, not a 500", async () => {
    mockDelete.mockRejectedValue(new ApiError(401, "Invalid password"))
    const res = await DELETE(req(JSON.stringify({ password: "no" })), ctx)
    expect(res.status).toBe(401)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).body).toEqual({ error: "Invalid password" })
  })

  it("rejects a malformed body with 400 before the service is called", async () => {
    const res = await DELETE(req("{not json"), ctx)
    expect(res.status).toBe(400)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("is unreachable without a valid bearer token", async () => {
    mockUser.mockRejectedValue(new ApiError(401, "Unauthorized"))
    const res = await DELETE(req(JSON.stringify({ password: "pw" })), ctx)
    expect(res.status).toBe(401)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
