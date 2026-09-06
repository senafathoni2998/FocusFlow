import webpush from "web-push"

/**
 * Web Push configuration and the one function that talks to a push service.
 *
 * VAPID is how a push service knows which server a message came from. The keys
 * are a single pair for the whole deployment, not per user: the public half is
 * handed to every browser at subscribe time and is baked into the subscription
 * the browser gives back, which has a consequence worth knowing before you
 * rotate them — CHANGING THE KEYS INVALIDATES EVERY EXISTING SUBSCRIPTION. Rows
 * created under the old public key start failing with 403, and the sender below
 * deletes them, so users have to re-enable push. Generate once with
 * `npm run push:keys` and keep them.
 */

export interface PushConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/**
 * Null when the deployment has not configured push, which is the normal state
 * for someone who never wanted it. EVERY caller must treat null as "the feature
 * is off" rather than as an error — a self-hosted install with no VAPID keys is
 * a valid install, and the reminder path must behave exactly as it did before
 * push existed.
 */
export function pushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  // The spec wants a contact for the push service to reach if this server
  // misbehaves. Any mailto: or https: URL is valid; the default is a legal
  // placeholder rather than a lie about a real address.
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@localhost"
  return { publicKey, privateKey, subject }
}

export function isPushConfigured(): boolean {
  return pushConfig() !== null
}

/** What one send did, from the sender's point of view. */
export type SendOutcome =
  /** Accepted by the push service. It will be delivered, or expire trying. */
  | { status: "sent" }
  /**
   * The subscription is dead — the browser was uninstalled, site data cleared,
   * or the VAPID keys were rotated underneath it. The row should be DELETED, and
   * this must never count as a delivery.
   */
  | { status: "gone"; code: number }
  /**
   * Anything else: the push service was unreachable or answered 5xx. Transient.
   * The row stays and the reminder must NOT be claimed, so the next run retries.
   */
  | { status: "failed"; code?: number; message: string }

export interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Push one payload to one browser.
 *
 * The three outcomes are deliberately distinct rather than a boolean, because
 * the CALLER has to act differently on each and conflating two of them loses
 * data: treating "gone" as a failure keeps a dead row forever and retries it
 * every minute; treating "failed" as a delivery claims a reminder that never
 * arrived, and `dispatchedAt` is one-way.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: unknown,
): Promise<SendOutcome> {
  const config = pushConfig()
  if (!config) return { status: "failed", message: "Push is not configured" }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      // A reminder that arrives an hour late is noise, and the staleness floor
      // in reminderWindow.ts already says so. Telling the push service the same
      // thing stops it holding a message for an offline device past the point
      // where delivering it helps.
      {
        TTL: 60 * 60,
        // A push service that accepts the socket and never answers would
        // otherwise hang this send — and the cron run around it — forever,
        // with the next minute's run piling up behind it. web-push destroys
        // the socket on this and rejects, which lands in the `failed` branch
        // below: transient, row kept, reminder deferred to the next run.
        timeout: 10_000,
      },
    )
    return { status: "sent" }
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    // 404: the endpoint never existed. 410 Gone: the browser unsubscribed.
    // 403: the VAPID key no longer matches the one the subscription was made
    // with — permanently unusable, same disposal as the other two.
    if (code === 404 || code === 410 || code === 403) {
      return { status: "gone", code }
    }
    return {
      status: "failed",
      code,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
