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
import type { Task, ListSummary } from "@/types/task"

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
}: SmartListSidebarProps) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  // Set when Enter/Escape resolves the input, so the unmount blur that follows
  // doesn't re-submit (real browsers fire blur on unmount; jsdom does not).
  const resolvedRef = useRef(false)

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
      </div>
    </nav>
  )
}
