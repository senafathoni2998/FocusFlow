import {
  startOfDay,
  addDays,
  startOfMonth,
  addMonths,
  startOfYear,
  addYears,
} from "date-fns"
import type { Task } from "@/types/task"

/**
 * Date-horizon engine — the heart of the task workspace's date views.
 *
 * Every named horizon resolves to a HALF-OPEN interval `[start, end)`. Half-open
 * bounds are deliberate: they dodge the 23:59:59.999 and DST edge bugs that
 * inclusive end-of-day math invites. All math runs in the browser's LOCAL time
 * (the same interpretation TaskCard's badge uses), so filter results always
 * match what the user sees.
 *
 * These functions are pure; status-aware smart-list semantics (e.g. "Today"
 * folding in overdue, "Overdue" excluding completed) live in taskFilters.ts.
 */

export type DateHorizon =
  | "all"
  | "overdue"
  | "today"
  | "tomorrow"
  | "next7days"
  | "thisMonth"
  | "nextMonth"
  | "thisYear"
  | "nextYear"
  | "noDate"
  | "custom"

export interface HorizonRange {
  kind: "all" | "range" | "overdue" | "noDate"
  /** Inclusive lower bound, or null for unbounded. */
  start: Date | null
  /** Exclusive upper bound, or null for unbounded. */
  end: Date | null
  label: string
}

export interface CustomRange {
  from?: Date | null
  to?: Date | null
}

/** Presets shown in the sidebar / picker, in display order. "custom" is offered separately. */
export const HORIZON_ORDER: DateHorizon[] = [
  "all",
  "overdue",
  "today",
  "tomorrow",
  "next7days",
  "thisMonth",
  "nextMonth",
  "thisYear",
  "nextYear",
  "noDate",
]

export const HORIZON_LABELS: Record<DateHorizon, string> = {
  all: "All",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  next7days: "Next 7 Days",
  thisMonth: "This Month",
  nextMonth: "Next Month",
  thisYear: "This Year",
  nextYear: "Next Year",
  noDate: "No Date",
  custom: "Custom",
}

export const HORIZON_ICONS: Record<DateHorizon, string> = {
  all: "📋",
  overdue: "⚠️",
  today: "⭐",
  tomorrow: "🌅",
  next7days: "📆",
  thisMonth: "🗓️",
  nextMonth: "⏭️",
  thisYear: "📅",
  nextYear: "🔮",
  noDate: "🕳️",
  custom: "🎯",
}

export function isDateHorizon(value: string | null | undefined): value is DateHorizon {
  return value != null && value in HORIZON_LABELS
}

/**
 * Resolve a horizon to a half-open `[start, end)` range in local time.
 * Calendar-aligned: This/Next Month snap to month boundaries; This/Next Year to
 * Jan 1. Rolling: Today / Next 7 Days start at the start of today.
 */
export function resolveHorizon(
  horizon: DateHorizon,
  now: Date = new Date(),
  custom?: CustomRange
): HorizonRange {
  const sod = startOfDay(now)

  switch (horizon) {
    case "all":
      return { kind: "all", start: null, end: null, label: "All" }
    case "overdue":
      return { kind: "overdue", start: null, end: sod, label: "Overdue" }
    case "today":
      return { kind: "range", start: sod, end: addDays(sod, 1), label: "Today" }
    case "tomorrow":
      return { kind: "range", start: addDays(sod, 1), end: addDays(sod, 2), label: "Tomorrow" }
    case "next7days":
      return { kind: "range", start: sod, end: addDays(sod, 7), label: "Next 7 Days" }
    case "thisMonth": {
      const s = startOfMonth(now)
      return { kind: "range", start: s, end: addMonths(s, 1), label: "This Month" }
    }
    case "nextMonth": {
      const s = startOfMonth(addMonths(now, 1))
      return { kind: "range", start: s, end: addMonths(s, 1), label: "Next Month" }
    }
    case "thisYear": {
      const s = startOfYear(now)
      return { kind: "range", start: s, end: addYears(s, 1), label: "This Year" }
    }
    case "nextYear": {
      const s = startOfYear(addYears(now, 1))
      return { kind: "range", start: s, end: addYears(s, 1), label: "Next Year" }
    }
    case "noDate":
      return { kind: "noDate", start: null, end: null, label: "No Date" }
    case "custom": {
      const start = custom?.from ? startOfDay(custom.from) : null
      const end = custom?.to ? addDays(startOfDay(custom.to), 1) : null
      return { kind: "range", start, end, label: "Custom" }
    }
    default:
      return { kind: "all", start: null, end: null, label: "All" }
  }
}

/** True if a task's due date falls in the resolved range (pure date test). */
export function matchesHorizon(
  due: Date | string | null | undefined,
  range: HorizonRange
): boolean {
  if (range.kind === "all") return true
  if (range.kind === "noDate") return due == null
  if (due == null) return false

  const t = new Date(due).getTime()
  if (isNaN(t)) return false

  if (range.start != null && t < range.start.getTime()) return false
  if (range.end != null && t >= range.end.getTime()) return false
  return true
}

export interface HorizonBucket {
  key: string
  label: string
  tasks: Task[]
}

/**
 * Group tasks into ordered "time-section" bands for the List view:
 * Overdue → Today → Tomorrow → Next 7 Days → This Month → Later → No Date.
 * First-match by due date; only non-empty bands are returned.
 */
export function bucketByHorizon(tasks: Task[], now: Date = new Date()): HorizonBucket[] {
  const sod = startOfDay(now)
  const d1 = addDays(sod, 1)
  const d2 = addDays(sod, 2)
  const d7 = addDays(sod, 7)
  const nextMonthStart = startOfMonth(addMonths(now, 1))

  const bands: { key: string; label: string; test: (t: number) => boolean }[] = [
    { key: "overdue", label: "Overdue", test: (t) => t < sod.getTime() },
    { key: "today", label: "Today", test: (t) => t >= sod.getTime() && t < d1.getTime() },
    { key: "tomorrow", label: "Tomorrow", test: (t) => t >= d1.getTime() && t < d2.getTime() },
    { key: "next7days", label: "Next 7 Days", test: (t) => t >= d2.getTime() && t < d7.getTime() },
    { key: "thisMonth", label: "This Month", test: (t) => t >= d7.getTime() && t < nextMonthStart.getTime() },
    { key: "later", label: "Later", test: (t) => t >= nextMonthStart.getTime() },
  ]

  const buckets: Record<string, Task[]> = {}
  const order = [...bands.map((b) => b.key), "noDate"]
  const labels: Record<string, string> = { ...Object.fromEntries(bands.map((b) => [b.key, b.label])), noDate: "No Date" }

  for (const task of tasks) {
    if (task.dueDate == null) {
      ;(buckets.noDate ??= []).push(task)
      continue
    }
    const t = new Date(task.dueDate).getTime()
    const band = isNaN(t) ? { key: "noDate" } : bands.find((b) => b.test(t)) ?? { key: "later" }
    ;(buckets[band.key] ??= []).push(task)
  }

  return order
    .filter((key) => buckets[key]?.length)
    .map((key) => ({ key, label: labels[key], tasks: buckets[key] }))
}
