"use client"

import { useEffect, useMemo, useState } from "react"
import type { Task } from "@/types/task"
import { isTerminalStatus } from "@/lib/taskConstants"
import EditTaskForm from "./EditTaskForm"

interface TaskCalendarViewProps {
  tasks: Task[]
  /** Client-side "now"; null until mounted (the whole view is date-dependent). */
  now: Date | null
  onUpdate?: () => void
  subtasksByParent?: Record<string, Task[]>
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-danger-500",
  medium: "bg-warning-500",
  low: "bg-success-500",
  none: "bg-gray-300",
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MAX_CHIPS = 3

/** Local calendar-day key (dueDate is stored at local midnight, so local getters
 *  bucket it onto the day the user picked). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

/**
 * Month-grid calendar: places each dated task on its due day. Undated tasks are
 * counted in a footer (not placeable). Chips open the task's edit form. Entirely
 * date-dependent, so it renders a skeleton until `now` is set (no hydration risk).
 */
export default function TaskCalendarView({ tasks, now, onUpdate, subtasksByParent }: TaskCalendarViewProps) {
  const [monthAnchor, setMonthAnchor] = useState<Date | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [dayDetail, setDayDetail] = useState<{ label: string; tasks: Task[] } | null>(null)

  useEffect(() => {
    if (now && !monthAnchor) setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1))
  }, [now, monthAnchor])

  // Bucket dated tasks by day, and count the undated ones.
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, Task[]>()
    let undatedCount = 0
    for (const t of tasks) {
      if (!t.dueDate) {
        undatedCount++
        continue
      }
      const key = dayKey(new Date(t.dueDate))
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    // Open tasks first within each day, so a completed task can never consume a
    // visible chip slot and hide an actionable one (V8 sort is stable).
    for (const arr of map.values()) {
      arr.sort((a, b) => Number(isTerminalStatus(a.status)) - Number(isTerminalStatus(b.status)))
    }
    return { byDay: map, undated: undatedCount }
  }, [tasks])

  if (!now || !monthAnchor) {
    return <div className="h-96 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
  }

  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  // Each cell is a day starting from the Sunday of the first week; negative /
  // over-length day numbers normalize across month & year boundaries.
  const cells = Array.from({ length: totalCells }, (_, i) => new Date(year, month, 1 - firstWeekday + i))
  const todayKey = dayKey(now)
  const monthLabel = monthAnchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const goToday = () => setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1))
  const shift = (delta: number) => setMonthAnchor(new Date(year, month + delta, 1))

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 leading-none"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 h-8 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 leading-none"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden border border-gray-200">
        {cells.map((cell) => {
          const key = dayKey(cell)
          const inMonth = cell.getMonth() === month
          const isToday = key === todayKey
          const dayTasks = byDay.get(key) ?? []
          return (
            <div
              key={key}
              data-date={key}
              className={`min-h-[6rem] p-1.5 flex flex-col gap-1 ${
                inMonth ? "bg-white" : "bg-gray-50"
              }`}
            >
              <div
                className={`text-xs font-medium tabular-nums w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-primary-600 text-white"
                    : inMonth
                      ? "text-gray-700"
                      : "text-gray-400"
                }`}
              >
                {cell.getDate()}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                {dayTasks.slice(0, MAX_CHIPS).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEditing(t)}
                    title={t.title}
                    className={`flex items-center gap-1 text-left text-xs px-1 py-0.5 rounded hover:bg-gray-100 min-w-0 ${
                      isTerminalStatus(t.status) ? "text-gray-400 line-through" : "text-gray-700"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.none
                      }`}
                    />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {dayTasks.length > MAX_CHIPS && (
                  <button
                    type="button"
                    onClick={() =>
                      setDayDetail({
                        label: cell.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }),
                        tasks: dayTasks,
                      })
                    }
                    className="text-[11px] text-gray-500 hover:text-primary-600 pl-1 text-left"
                  >
                    +{dayTasks.length - MAX_CHIPS} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {undated > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {undated} task{undated > 1 ? "s" : ""} with no due date (not shown on the calendar).
        </p>
      )}

      {editing && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <EditTaskForm
              task={editing as any}
              subtasks={subtasksByParent?.[editing.id]}
              onClose={() => setEditing(null)}
              onUpdate={onUpdate}
            />
          </div>
        </div>
      )}

      {dayDetail && !editing && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setDayDetail(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{dayDetail.label}</h3>
              <button
                type="button"
                onClick={() => setDayDetail(null)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1">
              {dayDetail.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setDayDetail(null)
                    setEditing(t)
                  }}
                  className={`flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 ${
                    isTerminalStatus(t.status) ? "text-gray-400 line-through" : "text-gray-700"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.none
                    }`}
                  />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
