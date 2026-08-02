import { prisma } from "@/lib/prisma"

/**
 * Email is a case-insensitive identifier in practice, but `User.email` is a plain
 * `@unique` Postgres column, which compares case-SENSITIVELY. Without the helpers
 * below, signing up as `Sena@Gmail.com` and later logging in as `sena@gmail.com`
 * fails with "Invalid email or password", and two accounts differing only in case
 * can both be created.
 */

/** Canonical form written to new rows. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Look up a user by email ignoring case, so rows written before normalization
 * (which may carry mixed case) stay reachable. Postgres-only (`mode: "insensitive"`),
 * which matches this app's only supported database.
 */
export function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
  })
}
