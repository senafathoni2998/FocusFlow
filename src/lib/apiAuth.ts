import { SignJWT, jwtVerify } from "jose"
import { unauthorized } from "@/lib/apiResponse"

/**
 * Bearer-token auth for the mobile REST API (`/api/v1/*`).
 *
 * The web app authenticates with a NextAuth session cookie, which native clients
 * can't use. Here we mint plain HS256-signed JWTs (access + refresh) keyed on the
 * same server secret and read them from the `Authorization: Bearer <token>` header.
 * These are independent of the NextAuth session — the two schemes coexist.
 */

const ACCESS_TTL = "30d"
const REFRESH_TTL = "90d"
const ISSUER = "focusflow"
const ACCESS_AUD = "focusflow-mobile"
const REFRESH_AUD = "focusflow-mobile-refresh"

function secretKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET (or AUTH_SECRET) is not set")
  }
  return new TextEncoder().encode(secret)
}

async function sign(userId: string, ttl: string, audience: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setExpirationTime(ttl)
    .sign(secretKey())
}

export function signAccessToken(userId: string): Promise<string> {
  return sign(userId, ACCESS_TTL, ACCESS_AUD)
}

export function signRefreshToken(userId: string): Promise<string> {
  return sign(userId, REFRESH_TTL, REFRESH_AUD)
}

/** Mint a fresh access+refresh pair (used by login/register/refresh). */
export async function issueTokens(userId: string): Promise<{
  accessToken: string
  refreshToken: string
  tokenType: "Bearer"
  expiresIn: number
}> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(userId),
    signRefreshToken(userId),
  ])
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    // Seconds — informational for the client; matches ACCESS_TTL (30 days).
    expiresIn: 30 * 24 * 60 * 60,
  }
}

async function verify(token: string, audience: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: ISSUER,
    audience,
  })
  const sub = payload.sub
  if (!sub || typeof sub !== "string") {
    throw unauthorized("Invalid token")
  }
  return sub
}

/** Verify a refresh token and return its subject (userId). Throws 401 otherwise. */
export async function verifyRefreshToken(token: string): Promise<string> {
  try {
    return await verify(token, REFRESH_AUD)
  } catch {
    throw unauthorized("Invalid or expired refresh token")
  }
}

/** Extract the bearer token from an Authorization header, or null. */
export function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * Require a valid access token and return the authenticated userId. Throws a 401
 * `ApiError` (surfaced as JSON by `handleRoute`) when the header is missing or the
 * token is invalid/expired.
 */
export async function requireApiUser(req: Request): Promise<string> {
  const token = bearerFrom(req)
  if (!token) {
    throw unauthorized("Missing bearer token")
  }
  try {
    return await verify(token, ACCESS_AUD)
  } catch {
    throw unauthorized("Invalid or expired token")
  }
}
