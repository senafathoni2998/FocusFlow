"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import Card from "@/components/ui/Card"
import { deleteMyAccount } from "@/app/actions/account"

/**
 * The end of the account, on the account's own settings page.
 *
 * Two steps and a password, and each is there for a reason: the first click
 * only reveals the form, so the button cannot be hit by accident while
 * scrolling; the password is required again because a session cookie on a
 * shared machine must not be enough to erase everything. There is no
 * "type DELETE to confirm" theatre — the password already proves intent.
 */
export default function DeleteAccountCard({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setError(null)
    const res = await deleteMyAccount(password)
    if ("error" in res && res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    // The row is gone; the cookie that names it must go too, or every page
    // fails on a user that no longer exists.
    await signOut({ callbackUrl: "/" })
  }

  return (
    <Card className="mt-6 p-6 border-red-200">
      <h2 className="text-lg font-semibold text-gray-900">Delete account</h2>
      <p className="mt-1 text-sm text-gray-500">
        Permanently deletes {email ? <strong>{email}</strong> : "this account"} and everything
        in it: tasks, habits and check-ins, goals, focus sessions, reminders, tags and saved
        views. This happens immediately and cannot be undone. Download your data first if
        you want a copy.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={handleDelete} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="delete-password">
            Enter your password to confirm
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
            disabled={busy}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !password}
              className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setPassword("")
                setError(null)
              }}
              disabled={busy}
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      )}
    </Card>
  )
}
