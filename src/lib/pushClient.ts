/**
 * Browser-side Web Push plumbing. No React, no server imports — just the four
 * awkward steps between "the user flipped a switch" and "a row exists".
 */

/** Why push is unavailable, in words a settings card can show verbatim. */
export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string }

export function checkPushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "Not in a browser" }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "This browser does not support service workers." }
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "This browser does not support Web Push." }
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "This browser does not support notifications." }
  }
  // Service workers are refused outside a secure context, and the failure is an
  // opaque registration error rather than anything that names the cause. Said
  // plainly here, because a self-hosted app on a LAN address over plain http is
  // exactly the setup that hits this.
  if (!window.isSecureContext) {
    return {
      supported: false,
      reason:
        "Background notifications need a secure context — serve the app over https (localhost also counts).",
    }
  }
  return { supported: true }
}

/**
 * The VAPID public key travels as base64url in JSON but `PushManager.subscribe`
 * wants raw bytes. Converting it wrong is the single most common reason a
 * subscribe call fails with an unhelpful `InvalidAccessError`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(normalised)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" })
}

export interface PlainSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** A PushSubscription reduced to what the server stores. */
export function toPlain(sub: PushSubscription): PlainSubscription | null {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

/**
 * Ask permission, register the worker, and subscribe.
 *
 * Throws with a message meant for a human, because every one of these steps can
 * fail for a reason the user can act on.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PlainSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again."
        : "Notification permission was not granted.",
    )
  }

  const registration = await registerServiceWorker()
  // A worker that is registered but not yet active cannot be subscribed against.
  await navigator.serviceWorker.ready

  // An existing subscription is REUSED rather than replaced. Calling subscribe()
  // again with a different applicationServerKey throws, and unsubscribing first
  // would hand out a new endpoint and orphan the row already on the server.
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    const plain = toPlain(existing)
    if (plain) return plain
    // Unreadable — the only way forward is to drop it and mint a fresh one.
    await existing.unsubscribe().catch(() => {})
  }

  const sub = await registration.pushManager.subscribe({
    // Required by every browser that implements Push: a subscription that could
    // receive silent pushes is not allowed, and Chrome rejects `false` outright.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })

  const plain = toPlain(sub)
  if (!plain) throw new Error("The browser returned a subscription we could not read.")
  return plain
}

/** Returns the endpoint that was cancelled, or null if there was nothing to cancel. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const registration = await navigator.serviceWorker.getRegistration("/")
  if (!registration) return null
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}

/** Whether THIS browser currently holds a subscription. */
export async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration("/")
  if (!registration) return null
  const sub = await registration.pushManager.getSubscription()
  return sub?.endpoint ?? null
}
