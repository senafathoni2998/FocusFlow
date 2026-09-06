"use server"

import { auth } from "@/lib/auth"
import { ApiError } from "@/lib/apiResponse"
import { deleteAccount } from "@/lib/services/authService"

/**
 * Delete the signed-in account. The web half of the same feature the mobile
 * app reaches through DELETE /api/v1/auth/me; one service, two doors.
 *
 * The caller signs the browser out afterwards — the JWT session cookie would
 * otherwise outlive the row it names, and every page would fail on a user that
 * no longer exists.
 */
export async function deleteMyAccount(password: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  try {
    await deleteAccount(userId, { password })
    return { success: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not delete the account" }
  }
}
