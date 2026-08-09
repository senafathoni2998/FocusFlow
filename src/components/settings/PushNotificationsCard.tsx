"use client"

import { useCallback, useEffect, useState } from "react"
import Card from "@/components/ui/Card"
import {
  getPushPublicKey,
  getPushSubscriptions,
  savePushSubscription,
  removePushSubscription,
  sendTestPushNotification,
} from "@/app/actions/push"
import {
  checkPushSupport,
  currentEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushClient"

/**
 * Turn background reminders on for THIS browser, and manage the others.
 *
 * Per browser, not per account, and the copy says so: a laptop and a desktop are
 * two independent subscriptions. That is also why the list below is not
 * decoration — unsubscribing goes through the browser's own PushManager, which
 * can only ever reach the browser doing the asking, so without a server-side
 * list an old laptop would keep receiving reminders forever with no way to stop
 * it from the machine you actually have.
 *
 * The card renders nothing when the deployment has no VAPID keys. A switch that
 * cannot work is worse than an absent one — especially here, where flipping it
 * would first extract a notification permission the user did not need to give.
 */

interface Row {
  id: string
  endpoint: string
  label: string
  createdAt: Date
  lastSuccessAt: Date | null
}

export default function PushNotificationsCard() {
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState<string | null>(null)

  const refreshRows = useCallback(async () => {
    setRows((await getPushSubscriptions()) as Row[])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const support = checkPushSupport()
      const key = await getPushPublicKey()
      const endpoint = support.supported ? await currentEndpoint() : null
      const list = key ? ((await getPushSubscriptions()) as Row[]) : []
      if (cancelled) return
      setUnsupported(support.supported ? null : support.reason)
      setVapidKey(key)
      setThisEndpoint(endpoint)
      setRows(list)
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
    setNotice(null)
    try {
      const sub = await subscribeToPush(vapidKey)
      const res = await savePushSubscription(sub)
      if (res && "error" in res && res.error) {
        // The browser is subscribed but the server does not know, which would
        // read as "on" and never deliver. Undo it so the switch tells the truth.
        await unsubscribeFromPush().catch(() => {})
        throw new Error(res.error)
      }
      setThisEndpoint(sub.endpoint)
      await refreshRows()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications")
    } finally {
      setBusy(false)
    }
  }, [vapidKey, refreshRows])

  /**
   * Revoke one browser. Passing this browser's own endpoint also cancels the
   * local subscription — dropping only the server row would leave the browser
   * subscribed at the push service with nothing to send to it, and the button
   * here would still read "on".
   */
  const revoke = useCallback(
    async (endpoint: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        if (endpoint === thisEndpoint) {
          await unsubscribeFromPush().catch(() => {})
          setThisEndpoint(null)
        }
        await removePushSubscription(endpoint)
        await refreshRows()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not turn notifications off")
      } finally {
        setBusy(false)
      }
    },
    [thisEndpoint, refreshRows],
  )

  const test = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await sendTestPushNotification()
      // A dead subscription is pruned by the send, so the list has to be re-read
      // or it would keep showing a browser that has just been removed.
      if (res.pruned > 0) await refreshRows()
      if (res.sent > 0) {
        setNotice(
          `Sent to ${res.sent} browser${res.sent === 1 ? "" : "s"}. If nothing appeared, check your system notification settings.`,
        )
      }
      if (res.failures.length > 0) setError(res.failures.join(" · "))
      else if (res.sent === 0) setError("Nothing to send to.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a test notification")
    } finally {
      setBusy(false)
    }
  }, [refreshRows])

  if (loading) return null
  // Not configured on the server — see the note at the top.
  if (!vapidKey) return null

  const enabledHere = thisEndpoint !== null

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
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enabledHere ? () => revoke(thisEndpoint) : enable}
            disabled={busy}
            className={
              enabledHere
                ? "inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                : "inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            }
          >
            {busy ? "Working…" : enabledHere ? "Turn off on this browser" : "Turn on for this browser"}
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={test}
              disabled={busy}
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Send a test notification
            </button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-900">Signed-up browsers</h3>
          <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">
                    {r.label}
                    {r.endpoint === thisEndpoint && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        this browser
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {/* Never delivered is the single most useful thing to show:
                        it is what a misconfigured setup looks like. */}
                    {r.lastSuccessAt
                      ? `Last delivered ${new Date(r.lastSuccessAt).toLocaleDateString()}`
                      : "Never delivered yet"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(r.endpoint)}
                  disabled={busy}
                  className="shrink-0 text-sm text-gray-500 hover:text-red-600 disabled:opacity-60"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && !error && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Card>
  )
}
