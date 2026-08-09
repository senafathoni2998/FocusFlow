"use client"

import { useCallback, useEffect, useState } from "react"
import Card from "@/components/ui/Card"
import {
  getPushPublicKey,
  savePushSubscription,
  removePushSubscription,
} from "@/app/actions/push"
import {
  checkPushSupport,
  currentEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushClient"

/**
 * Turn background reminders on for THIS browser.
 *
 * Per browser, not per account, and the copy says so: a laptop and a desktop are
 * two independent subscriptions, and turning it on here says nothing about the
 * other one. Getting that wrong would have people wondering why their reminders
 * "stopped" on a machine they never enabled.
 *
 * The card renders nothing when the deployment has no VAPID keys. A switch that
 * cannot work is worse than an absent one — especially here, where flipping it
 * would first extract a notification permission the user did not need to give.
 */
export default function PushNotificationsCard() {
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const support = checkPushSupport()
      const key = await getPushPublicKey()
      const endpoint = support.supported ? await currentEndpoint() : null
      if (cancelled) return
      setUnsupported(support.supported ? null : support.reason)
      setVapidKey(key)
      setEnabled(endpoint !== null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    if (!vapidKey) return
    setBusy(true)
    setError(null)
    try {
      const sub = await subscribeToPush(vapidKey)
      const res = await savePushSubscription(sub)
      if (res && "error" in res && res.error) {
        // The browser is subscribed but the server does not know, which would
        // read as "on" and never deliver. Undo it so the switch tells the truth.
        await unsubscribeFromPush().catch(() => {})
        throw new Error(res.error)
      }
      setEnabled(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications")
    } finally {
      setBusy(false)
    }
  }, [vapidKey])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const endpoint = await unsubscribeFromPush()
      // Told to the server even when the browser had nothing to cancel: the row
      // is what actually causes a send, so leaving it behind would keep pushing
      // to an endpoint that no longer accepts anything.
      if (endpoint) await removePushSubscription(endpoint)
      setEnabled(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn notifications off")
    } finally {
      setBusy(false)
    }
  }, [])

  if (loading) return null
  // Not configured on the server — see the note at the top.
  if (!vapidKey) return null

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Background reminders</h2>
      <p className="mt-1 text-sm text-gray-500">
        Get task reminders as system notifications even when FocusFlow is closed.
        This is a per-browser setting — turning it on here does not affect your
        other computers, and reminders still appear in the app either way.
      </p>

      {unsupported ? (
        <p className="mt-4 text-sm text-gray-600">{unsupported}</p>
      ) : (
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={busy}
          className={
            enabled
              ? "mt-4 inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              : "mt-4 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          }
        >
          {busy
            ? "Working…"
            : enabled
              ? "Turn off on this browser"
              : "Turn on for this browser"}
        </button>
      )}

      {enabled && !error && (
        <p className="mt-3 text-sm text-green-700">
          On for this browser. Reminders will arrive with FocusFlow closed.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  )
}
