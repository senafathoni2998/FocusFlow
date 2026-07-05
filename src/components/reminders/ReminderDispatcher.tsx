"use client"

import { useEffect, useRef, useState } from "react"
import { getDueReminders, markRemindersDispatched } from "@/app/actions/reminders"

/**
 * Delivers reminders while the app is open in a browser tab (the no-infra
 * channel): it polls the "due" query, shows a browser Web Notification (if the
 * user granted permission) plus an in-app banner, then marks them dispatched so
 * each fires exactly once. Real background delivery (fires when the app is
 * closed) would need a service worker + Web Push — a future upgrade.
 *
 * Known limitation: with the app open in multiple tabs, a reminder can be
 * delivered in more than one of them (each tab polls independently). Fine for a
 * single-user app; cross-tab coordination is out of scope.
 */

const POLL_MS = 60_000
const BANNER_TTL_MS = 15_000

interface FiredReminder {
  id: string
  title: string
}

function showBrowserNotification(title: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return
  try {
    new Notification("FocusFlow reminder", { body: title })
  } catch {
    // Some browsers only allow notifications via a service worker — ignore and
    // rely on the in-app banner.
  }
}

export default function ReminderDispatcher() {
  const [banners, setBanners] = useState<FiredReminder[]>([])
  // Reminders already handled this session, so overlapping polls can't double-fire.
  const firedRef = useRef<Set<string>>(new Set())
  const pollingRef = useRef(false)

  const dismiss = (id: string) => setBanners((prev) => prev.filter((b) => b.id !== id))

  useEffect(() => {
    // Best-effort permission prompt; if blocked/denied we still show the banner.
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {})
    }

    let cancelled = false

    const poll = async () => {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        const due = await getDueReminders()
        if (cancelled) return

        const fresh = due.filter((r) => !firedRef.current.has(r.id))
        if (fresh.length === 0) return

        const freshIds = fresh.map((r) => r.id)
        freshIds.forEach((id) => firedRef.current.add(id))

        // Claim them (mark dispatched) BEFORE surfacing anything. A failed mark —
        // whether a returned error OR a thrown rejection (offline/500/auth) — then
        // un-tracks so the next poll retries, and shows nothing (so a persistently
        // failing mark can't spam a fresh banner/notification every minute). Only a
        // successful claim shows the reminder, so it surfaces exactly once.
        let marked = false
        try {
          const res = await markRemindersDispatched(freshIds)
          marked = !(res && "error" in res && res.error)
        } catch {
          marked = false
        }
        if (cancelled) return
        if (!marked) {
          freshIds.forEach((id) => firedRef.current.delete(id))
          return
        }

        const shown: FiredReminder[] = fresh.map((r) => ({
          id: r.id,
          title: r.task?.title ?? "Task",
        }))
        shown.forEach((r) => showBrowserNotification(r.title))
        setBanners((prev) => [...prev, ...shown])
        shown.forEach((r) =>
          setTimeout(() => setBanners((prev) => prev.filter((b) => b.id !== r.id)), BANNER_TTL_MS)
        )
      } catch {
        // Transient failure — the next tick retries.
      } finally {
        pollingRef.current = false
      }
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (banners.length === 0) return null

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-7rem)]">
      {banners.map((b) => (
        <div
          key={b.id}
          role="alert"
          className="flex items-start gap-3 bg-white border border-warning-300 shadow-lg rounded-xl px-4 py-3"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            🔔
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Reminder</p>
            <p className="text-sm text-gray-600 truncate">{b.title}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(b.id)}
            aria-label="Dismiss reminder"
            className="text-gray-400 hover:text-gray-600 leading-none"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
