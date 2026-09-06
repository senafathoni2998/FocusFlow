/**
 * @jest-environment node
 *
 * deleteAccount: one statement that removes everything a user owns, so the two
 * things that must hold are that it never runs on the wrong evidence, and that
 * it runs on exactly the row asked for.
 */
// authService imports @/lib/apiAuth, which imports `jose` — ESM that Jest cannot
// parse. Nothing here signs a token, so a stub is all it takes.
jest.mock("jose", () => ({ SignJWT: jest.fn(), jwtVerify: jest.fn() }))
jest.mock("bcryptjs", () => ({ compare: jest.fn() }))

import { compare } from "bcryptjs"
import { deleteAccount } from "@/lib/services/authService"
import { ApiError } from "@/lib/apiResponse"
import { resetRateLimits, LOGIN_LIMIT } from "@/lib/rateLimit"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient
const mockCompare = compare as jest.MockedFunction<typeof compare>

const status = async (p: Promise<unknown>) => {
  try { await p; return 200 } catch (e) { return e instanceof ApiError ? e.status : -1 }
}

beforeEach(() => {
  jest.resetAllMocks()
  resetRateLimits()
  prisma.user.findUnique = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.co", password: "$hash" })
  prisma.user.delete = jest.fn().mockResolvedValue({ id: "u1" })
  mockCompare.mockResolvedValue(true as never)
})

describe("deleteAccount", () => {
  it("deletes exactly the caller's row once the password checks out", async () => {
    await expect(deleteAccount("u1", { password: "right" })).resolves.toEqual({ success: true })
    expect(mockCompare).toHaveBeenCalledWith("right", "$hash")
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } })
  })

  it("refuses a wrong password with a 401 and touches nothing", async () => {
    // A bearer token alone must not be enough: a phone left unlocked, a cookie
    // on a shared machine. The password is the proof of intent.
    mockCompare.mockResolvedValue(false as never)
    expect(await status(deleteAccount("u1", { password: "wrong" }))).toBe(401)
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it("refuses an empty password before reaching the database", async () => {
    await expect(deleteAccount("u1", { password: "" })).rejects.toBeTruthy()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it("answers 401 for a user that no longer exists, rather than deleting nothing silently", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await status(deleteAccount("ghost", { password: "x" }))).toBe(401)
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })

  it("throttles password guesses per account with the login budget", async () => {
    mockCompare.mockResolvedValue(false as never)
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      expect(await status(deleteAccount("u1", { password: "guess" }))).toBe(401)
    }
    expect(await status(deleteAccount("u1", { password: "guess" }))).toBe(429)
    // A different account is a different bucket.
    prisma.user.findUnique.mockResolvedValue({ id: "u2", email: "c@d.co", password: "$h2" })
    expect(await status(deleteAccount("u2", { password: "guess" }))).toBe(401)
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })
})
