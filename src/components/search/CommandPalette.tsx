"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { globalSearch, type SearchHit } from "@/app/actions/search"

/**
 * Cmd/Ctrl-K search across tasks, goals, habits and lists.
 *
 * Mounted once in the layout so it is reachable from anywhere — the point is to
 * stop the user having to first work out WHICH section a thing lives in before
 * they can look for it.
 *
 * Navigation targets are honest about what the app can address: there are no
 * per-entity detail routes, so a task jumps to the tasks view pre-filtered to its
 * title, a list jumps to that list, and goals/habits jump to their board. That is
 * one click from the thing rather than zero, but it beats the alternative of
 * inventing routes this change has no business adding.
 */

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  task: "Task",
  goal: "Goal",
  habit: "Habit",
  list: "List",
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guards against an earlier, slower response overwriting a newer one.
  const seqRef = useRef(0)

  // Global hotkey.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setHits([])
      setActive(0)
      // Focus after the dialog paints.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const seq = ++seqRef.current
    const t = setTimeout(async () => {
      const res = await globalSearch(q)
      if (seq !== seqRef.current) return
      setHits(res)
      setActive(0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false)
      switch (hit.type) {
        case "task":
          router.push(`/tasks?q=${encodeURIComponent(hit.title)}`)
          break
        case "list":
          router.push(`/tasks?list=${encodeURIComponent(hit.id)}`)
          break
        case "goal":
          router.push("/goals")
          break
        case "habit":
          router.push("/habits")
          break
      }
    },
    [router]
  )

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (hits.length ? (i + 1) % hits.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0))
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault()
      go(hits[active])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search tasks, goals, habits, lists…"
          aria-label="Search everything"
          className="w-full px-4 py-3 text-base outline-none border-b border-gray-100 text-gray-800 placeholder:text-gray-400"
        />

        <div className="max-h-80 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-6 text-sm text-gray-400">
              Type at least two characters.
            </p>
          ) : loading ? (
            <p className="px-4 py-6 text-sm text-gray-400">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No matches.</p>
          ) : (
            <ul role="listbox" className="py-1">
              {hits.map((hit, i) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                      i === active ? "bg-primary-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-lg w-6 text-center" aria-hidden="true">
                      {hit.icon ?? ""}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-800 truncate">
                        {hit.title}
                      </span>
                      {hit.subtitle && (
                        <span className="block text-xs text-gray-400">{hit.subtitle}</span>
                      )}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {TYPE_LABEL[hit.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex gap-4">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
