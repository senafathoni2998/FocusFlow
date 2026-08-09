"use server"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  saveSubscription,
  deleteSubscription,
  listSubscriptions,
  sendTestPush,
} from "@/lib/services/pushService"
import { pushConfig } from "@/lib/webPush"

/**
 * Subscribe / unsubscribe this browser for background reminders.
 *
 * Server Actions rather than `/api/v1` routes: this is the WEB client, which
 * authenticates with the NextAuth session cookie. The mobile app does not use
 * Web Push at all — it has its own foreground notification poller, and waking a
 * closed Android app needs FCM, a different transport with a different threat
 * model for a self-hosted deployment.
 */

/**
 * The VAPID public key the browser needs in order to subscribe, or null when
 * the deployment has not configured push.
 *
 * Null is the signal the UI keys off to hide the toggle entirely. Showing a
 * switch that cannot work — and only saying so after the user has granted a
 * notification permission they did not need to — is worse than not offering it.
 *
 * The PRIVATE key is never returned here, and this is the only place the two sit
 * close enough together for that to be a live risk.
 */
export async function getPushPublicKey(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return pushConfig()?.publicKey ?? null
}

export async function savePushSubscription(subscription: unknown) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  try {
    const ua = (await headers()).get("user-agent")
    return await saveSubscription(userId, subscription, ua)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the subscription" }
  }
}

export async function removePushSubscription(endpoint: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  try {
    return await deleteSubscription(userId, { endpoint })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove the subscription" }
  }
}

/**
 * The browsers currently signed up, for the Settings list.
 *
 * The list is the ONLY way to turn push off on a machine you are not sitting at:
 * unsubscribing works through the browser's own PushManager, which can obviously
 * only reach the browser doing the asking. Without this, an old laptop keeps
 * receiving your reminders forever.
 */
export async function getPushSubscriptions() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []
  try {
    return await listSubscriptions(userId)
  } catch {
    return []
  }
}

/** Push a "this works" notification to every browser signed up, right now. */
export async function sendTestPushNotification() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { sent: 0, pruned: 0, failures: ["Unauthorized"] }

  try {
    return await sendTestPush(userId)
  } catch (e) {
    return {
      sent: 0,
      pruned: 0,
      failures: [e instanceof Error ? e.message : "Could not send a test notification"],
    }
  }
}
