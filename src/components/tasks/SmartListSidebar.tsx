"use client"

import { useMemo } from "react"
import {
  HORIZON_ORDER,
  HORIZON_LABELS,
  HORIZON_ICONS,
  type DateHorizon,
} from "@/lib/dateHorizon"
import { horizonCounts } from "@/lib/taskFilters"
import type { Task } from "@/types/task"

interface SmartListSidebarProps {
  tasks: Task[]
  /** Client-side "now"; null until mounted (counts hidden until then). */
  now: Date | null
  activeHorizon: DateHorizon
  onSelect: (horizon: DateHorizon) => void
}

/**
 * Left rail of one-click date smart lists with live counts. Selecting one drives
 * the URL (`?horizon=`) via the workspace, so each list is a shareable link.
 */
export default function SmartListSidebar({
  tasks,
  now,
  activeHorizon,
  onSelect,
}: SmartListSidebarProps) {
  const counts = useMemo(
    () => (now ? horizonCounts(tasks, now) : null),
    [tasks, now]
  )

  return (
    <nav aria-label="Smart lists" className="lg:w-56 lg:flex-shrink-0">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-6">
        {HORIZON_ORDER.map((horizon) => {
          const active = horizon === activeHorizon
          const count = counts?.[horizon]
          return (
            <button
              key={horizon}
              type="button"
              onClick={() => onSelect(horizon)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                active
                  ? "bg-primary-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
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
      </div>
    </nav>
  )
}
