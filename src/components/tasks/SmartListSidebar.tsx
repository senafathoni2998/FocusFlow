"use client"

import { useMemo, useRef, useState } from "react"
import {
  HORIZON_ORDER,
  HORIZON_LABELS,
  HORIZON_ICONS,
  type DateHorizon,
} from "@/lib/dateHorizon"
import { horizonCounts } from "@/lib/taskFilters"
import { isTerminalStatus } from "@/lib/taskConstants"
import type { Task, ListSummary, SavedFilterSummary } from "@/types/task"

type SaveResult = { success?: boolean; error?: string } | undefined

interface SmartListSidebarProps {
  tasks: Task[]
  /** Client-side "now"; null until mounted (counts hidden until then). */
  now: Date | null
  activeHorizon: DateHorizon
  onSelectHorizon: (horizon: DateHorizon) => void
  lists: ListSummary[]
  /** undefined = all lists; null = Inbox; string = that list. */
  activeListId: string | null | undefined
  onSelectList: (listId: string | null) => void
  onCreateList: (name: string) => void
  onDeleteList: (id: string) => void
  savedFilters: SavedFilterSummary[]
  /** Id of the saved view whose query matches the current URL, or null. */
  activeSavedId: string | null
  /** Save the current view under a name; resolves to the action result. */
  onSaveFilter: (name: string) => Promise<SaveResult>
  onApplyFilter: (query: string) => void
  onDeleteFilter: (id: string) => void
}

/**
 * Left rail: date smart lists (with live counts) plus the user's Lists (Inbox +
 * custom lists). Selecting either drives the URL via the workspace, so views are
 * shareable links.
 */
export default function SmartListSidebar({
  tasks,
  now,
  activeHorizon,
  onSelectHorizon,
  lists,
  activeListId,
  onSelectList,
  onCreateList,
  onDeleteList,
  savedFilters,
  activeSavedId,
  onSaveFilter,
  onApplyFilter,
  onDeleteFilter,
}: SmartListSidebarProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  // Set when Enter/Escape resolves the input, so the unmount blur that follows
  // doesn't re-submit (real browsers fire blur on unmount; jsdom does not).
  const resolvedRef = useRef(false)

  // "Save current view" inline input (mirrors the Lists add-input).
  const [savingView, setSavingView] = useState(false)
  const [viewName, setViewName] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const savedResolvedRef = useRef(false)
  // Guards against concurrent saves (a held/double Enter fires keydown repeatedly
  // while the async save is still in flight).
  const submittingRef = useRef(false)

  const submitSaveView = async () => {
    if (submittingRef.current) return
    const name = viewName.trim()
    if (!name) {
      setSavingView(false)
      setSaveError(null)
      return
    }
    submittingRef.current = true
    try {
      const res = await onSaveFilter(name)
      if (res?.error) {
        // Keep the input open so the name can be corrected. The Enter that got us
        // here armed savedResolvedRef to suppress the unmount-blur — but there's no
        // unmount on error, so clear it or the next real blur-to-save is swallowed.
        setSaveError(res.error)
        savedResolvedRef.current = false
        return
      }
      setViewName("")
      setSaveError(null)
      setSavingView(false)
    } finally {
      submittingRef.current = false
    }
  }

  const counts = useMemo(
    () => (now ? horizonCounts(tasks, now) : null),
    [tasks, now]
  )

  // Open (non-terminal) task counts per list, computed client-side so they stay
  // live with optimistic updates.
  const listCounts = useMemo(() => {
    const map = new Map<string, number>()
    let inbox = 0
    for (const t of tasks) {
      if (isTerminalStatus(t.status)) continue
      if (t.listId == null) inbox++
      else map.set(t.listId, (map.get(t.listId) ?? 0) + 1)
    }
    return { map, inbox }
  }, [tasks])

  const submitNewList = () => {
    const name = newName.trim()
    if (name) onCreateList(name)
    setNewName("")
    setAdding(false)
  }

  const rowClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
      active ? "bg-primary-600 text-white" : "text-gray-700 hover:bg-gray-100"
    }`

  return (
    <nav aria-label="Smart lists" className="lg:w-56 lg:flex-shrink-0">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-6">
        {/* Date horizons */}
        {HORIZON_ORDER.map((horizon) => {
          const active = horizon === activeHorizon
          const count = counts?.[horizon]
          return (
            <button
              key={horizon}
              type="button"
              onClick={() => onSelectHorizon(horizon)}
              aria-current={active ? "page" : undefined}
              className={rowClass(active)}
            >
              <span aria-hidden="true">{HORIZON_ICONS[horizon]}</span>
              <span className="flex-1 text-left">{HORIZON_LABELS[horizon]}</span>
              {count != null && count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
                    active ? "bg-primary-500 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Lists */}
        <div className="flex items-center justify-between mt-4 mb-1 px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Lists
          </span>
          <button
            type="button"
            onClick={() => {
              resolvedRef.current = false
              setAdding((v) => !v)
            }}
            aria-label="New list"
            className="text-gray-400 hover:text-primary-600 text-lg leading-none"
          >
            +
          </button>
        </div>

        {/* Inbox */}
        <button
          type="button"
          onClick={() => onSelectList(null)}
          aria-current={activeListId === null ? "page" : undefined}
          className={rowClass(activeListId === null)}
        >
          <span aria-hidden="true">📥</span>
          <span className="flex-1 text-left">Inbox</span>
          {listCounts.inbox > 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
                activeListId === null ? "bg-primary-500 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {listCounts.inbox}
            </span>
          )}
        </button>

        {lists.map((list) => {
          const active = activeListId === list.id
          const count = listCounts.map.get(list.id) ?? 0
          return (
            <div key={list.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => onSelectList(list.id)}
                aria-current={active ? "page" : undefined}
                className={`${rowClass(active)} flex-1`}
              >
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color || "#9ca3af" }}
                />
                <span className="flex-1 text-left truncate">{list.name}</span>
                {count > 0 && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
                      active ? "bg-primary-500 text-white" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDeleteList(list.id)}
                aria-label={`Delete list ${list.name}`}
                className="absolute right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-danger-600 text-xs px-1"
              >
                ✕
              </button>
            </div>
          )
        })}

        {adding && (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                resolvedRef.current = true
                submitNewList()
              }
              if (e.key === "Escape") {
                resolvedRef.current = true
                setNewName("")
                setAdding(false)
              }
            }}
            onBlur={() => {
              if (!resolvedRef.current) submitNewList()
              resolvedRef.current = false
            }}
            placeholder="List name…"
            aria-label="New list name"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
          />
        )}

        {/* Saved views */}
        <div className="flex items-center justify-between mt-4 mb-1 px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Saved
          </span>
          <button
            type="button"
            onClick={() => {
              savedResolvedRef.current = false
              setSaveError(null)
              setViewName("")
              setSavingView((v) => !v)
            }}
            aria-label="Save current view"
            title="Save the current filters as a view"
            className="text-gray-400 hover:text-primary-600 text-lg leading-none"
          >
            +
          </button>
        </div>

        {savedFilters.length === 0 && !savingView && (
          <p className="px-3 text-xs text-gray-400">
            Filter your tasks, then save the view.
          </p>
        )}

        {savedFilters.map((f) => {
          const active = f.id === activeSavedId
          return (
            <div key={f.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => onApplyFilter(f.query)}
                aria-current={active ? "page" : undefined}
                className={`${rowClass(active)} flex-1`}
              >
                <span aria-hidden="true">⭐</span>
                <span className="flex-1 text-left truncate">{f.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteFilter(f.id)}
                aria-label={`Delete saved view ${f.name}`}
                className="absolute right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-danger-600 text-xs px-1"
              >
                ✕
              </button>
            </div>
          )
        })}

        {savingView && (
          <div className="flex flex-col gap-1">
            <input
              autoFocus
              value={viewName}
              onChange={(e) => {
                setViewName(e.target.value)
                if (saveError) setSaveError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  savedResolvedRef.current = true
                  submitSaveView()
                }
                if (e.key === "Escape") {
                  savedResolvedRef.current = true
                  setViewName("")
                  setSaveError(null)
                  setSavingView(false)
                }
              }}
              onBlur={() => {
                if (!savedResolvedRef.current) submitSaveView()
                savedResolvedRef.current = false
              }}
              placeholder="View name…"
              aria-label="Saved view name"
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
            />
            {saveError && (
              <span className="px-3 text-xs text-danger-600">{saveError}</span>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
