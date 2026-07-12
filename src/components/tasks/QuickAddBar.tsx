"use client"

import { useMemo, useRef, useState } from "react"
import { createTask } from "@/app/actions/tasks"
import { dispatchTaskUpdate } from "@/lib/taskEvents"
import { parseQuickAdd, hasDateHint } from "@/lib/quickAddParser"

interface QuickAddBarProps {
  /** Called after a task is created so the workspace can refresh. */
  onCreated?: () => void
  /** When set (a list is being viewed), new quick-adds go into that list. */
  listId?: string | null
}

const PRIORITY_CHIP: Record<string, string> = {
  high: "bg-danger-100 text-danger-700",
  medium: "bg-warning-100 text-warning-700",
  low: "bg-primary-100 text-primary-700",
  none: "bg-gray-100 text-gray-600",
}

export default function QuickAddBar({ onCreated, listId }: QuickAddBarProps) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // Synchronous in-flight guard: `busy` is async React state, so two Enter
  // keydowns in the same tick could both pass a `busy` check and double-create.
  const inFlight = useRef(false)

  // Live, instant preview of what the deterministic parser sees as you type.
  const preview = useMemo(() => parseQuickAdd(value), [value])
  const willAskAI = !preview.matchedDate && hasDateHint(preview.title)

  const submit = async () => {
    const raw = value.trim()
    if (!raw || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      const parsed = parseQuickAdd(raw)
      let title = parsed.title
      let dueDate = parsed.dueDate

      // AI date fallback: only when we found no date but the text looks like it
      // names one. Any failure (no provider, network, bad reply) is non-fatal —
      // we still create the task, just without the AI-resolved date.
      if (!parsed.matchedDate && hasDateHint(parsed.title)) {
        try {
          const res = await fetch("/api/ai/quick-add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: parsed.title }),
          })
          if (res.ok) {
            const data = await res.json()
            if (typeof data.title === "string" && data.title.trim()) title = data.title.trim()
            if (typeof data.dueDate === "string") dueDate = data.dueDate
          }
        } catch {
          /* keep the deterministic result */
        }
      }

      if (!title) return

      const result = await createTask({
        title,
        dueDate,
        tags: parsed.tags,
        priority: parsed.priority,
        listId: listId ?? undefined,
      })

      if (result?.error) {
        setError(result.error)
        return
      }

      setValue("")
      dispatchTaskUpdate("task-created", result.task)
      onCreated?.()
    } catch {
      setError("Couldn't add the task. Please try again.")
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex gap-2">
        <input
          id="quick-add"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          disabled={busy}
          aria-label="Quick add a task"
          aria-busy={busy}
          placeholder="Quick add — e.g. Pay rent tomorrow #home !high"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !value.trim()}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      {/* Live preview of the parsed tokens. */}
      {value.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" aria-hidden="true">
          <span className="text-gray-400">→</span>
          <span className="font-medium text-gray-700">{preview.title || "(no title yet)"}</span>
          {preview.dueDate && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-700">
              📅 {preview.dueDate}
            </span>
          )}
          {!preview.dueDate && willAskAI && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
              📅 AI will read the date
            </span>
          )}
          {preview.priority && (
            <span
              className={`rounded-full px-2 py-0.5 ${PRIORITY_CHIP[preview.priority] ?? "bg-gray-100 text-gray-600"}`}
            >
              !{preview.priority}
            </span>
          )}
          {preview.tags.map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
              #{t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  )
}
