import { hash, compare } from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ApiError, badRequest, unauthorized } from "@/lib/apiResponse"
import { issueTokens, verifyRefreshToken } from "@/lib/apiAuth"

/**
 * Auth for the mobile API: register + login return a bearer token pair; refresh
 * exchanges a refresh token for a new pair. Password hashing mirrors the web
 * signup route (bcrypt, cost 10) so the same user rows work for both surfaces.
 */

// A valid-format bcrypt hash used only to spend the same CPU as a real comparison
// when the email doesn't exist, so login response time doesn't reveal whether an
// account exists (mitigates timing-based user enumeration).
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().max(100).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function publicUser(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name }
}

export async function registerUser(input: unknown) {
  const { email, password, name } = credentialsSchema.parse(input)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new ApiError(409, "A user with that email already exists")
  }

  const hashed = await hash(password, 10)
  const user = await prisma.user.create({
    data: { email, password: hashed, name },
    select: { id: true, email: true, name: true },
  })

  const tokens = await issueTokens(user.id)
  return { user: publicUser(user), ...tokens }
}

export async function loginUser(input: unknown) {
  const { email, password } = loginSchema.parse(input)

  const user = await prisma.user.findUnique({ where: { email } })
  // Uniform error AND uniform timing: spend the bcrypt cost even when the email is
  // unknown, so response time doesn't reveal whether the account exists.
  if (!user) {
    await compare(password, DUMMY_HASH)
    throw unauthorized("Invalid email or password")
  }

  const match = await compare(password, user.password)
  if (!match) throw unauthorized("Invalid email or password")

  const tokens = await issueTokens(user.id)
  return { user: publicUser(user), ...tokens }
}

export async function refreshTokens(input: unknown) {
  const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(input)
  if (!parsed.success) throw badRequest("refreshToken is required")

  const userId = await verifyRefreshToken(parsed.data.refreshToken)

  // Ensure the user still exists (a deleted account's refresh token is dead).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })
  if (!user) throw unauthorized("Invalid or expired refresh token")

  const tokens = await issueTokens(user.id)
  return { user: publicUser(user), ...tokens }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, aiProvider: true, createdAt: true },
  })
  if (!user) throw unauthorized()
  return { user }
}
