"use client"

import { useState } from "react"
import Card from "@/components/ui/Card"

/**
 * Download-your-data control.
 *
 * A plain <a download> would be simpler, but it gives no feedback while the
 * server assembles the file and no error if it fails — the browser just does
 * nothing, which on a backup feature is the worst possible outcome because the
 * user walks away believing they have a copy.
 */
export default function DataExportCard() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  const handleExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/export")
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`)
      }
      const blob = await res.blob()

      // Prefer the server's filename; fall back if the header is stripped.
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match?.[1] ?? "focusflow-export.json"

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setLastSaved(filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Your data</h2>
      <p className="mt-1 text-sm text-gray-500">
        Download everything in this account as a single JSON file: tasks (with their
        tags, subtasks, reminders and recurrence), lists, tags, habits and their
        check-ins, goals, focus sessions and saved views. Archived items are
        included. Your password and API keys are not.
      </p>

      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="mt-4 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Download my data"}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {lastSaved && !error && (
        <p className="mt-3 text-sm text-green-700">Saved {lastSaved}</p>
      )}
    </Card>
  )
}
