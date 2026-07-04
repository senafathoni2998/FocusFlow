"use client"

import type { TaskFilters, SortKey } from "@/lib/taskFilters"

export type ViewMode = "board" | "list"

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
]

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
]

interface FilterBarProps {
  filters: TaskFilters
  view: ViewMode
  onChange: (patch: Partial<TaskFilters>) => void
  onViewChange: (view: ViewMode) => void
}

const toYMD = (d?: Date | null): string =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    : ""

const fromYMD = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export default function FilterBar({ filters, view, onChange, onViewChange }: FilterBarProps) {
  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {/* View switcher */}
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        {(["board", "list"] as ViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={`px-3 py-1.5 text-sm capitalize ${
              view === v
                ? "bg-primary-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
        placeholder="Search tasks…"
        aria-label="Search tasks"
        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
      />

      {/* Status pills */}
      <div className="flex gap-1">
        {STATUS_OPTIONS.map((o) => {
          const on = filters.statuses.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ statuses: toggle(filters.statuses, o.value) })}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition ${
                on ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {/* Priority pills */}
      <div className="flex gap-1">
        {PRIORITY_OPTIONS.map((o) => {
          const on = filters.priorities.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ priorities: toggle(filters.priorities, o.value) })}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition ${
                on ? "bg-warning-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {/* Sort (board columns are always manually ordered, so sort applies to the list view) */}
      {view === "list" && (
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortKey })}
          aria-label="Sort tasks"
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 bg-white"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
      )}

      {/* Custom date range */}
      <div className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
        <span className="hidden sm:inline">Range</span>
        <input
          type="date"
          value={toYMD(filters.custom?.from)}
          onChange={(e) =>
            onChange({ custom: { from: fromYMD(e.target.value), to: filters.custom?.to ?? null } })
          }
          aria-label="Custom range from"
          className="px-2 py-1 border border-gray-200 rounded text-gray-700"
        />
        <span aria-hidden="true">→</span>
        <input
          type="date"
          value={toYMD(filters.custom?.to)}
          onChange={(e) =>
            onChange({ custom: { from: filters.custom?.from ?? null, to: fromYMD(e.target.value) } })
          }
          aria-label="Custom range to"
          className="px-2 py-1 border border-gray-200 rounded text-gray-700"
        />
      </div>
    </div>
  )
}
