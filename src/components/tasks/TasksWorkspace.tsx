"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Task, ListSummary } from "@/types/task"
import {
  applyFilters,
  type TaskFilters,
  type SortKey,
} from "@/lib/taskFilters"
import { type DateHorizon, isDateHorizon } from "@/lib/dateHorizon"
import { isTerminalStatus } from "@/lib/taskConstants"
import { useTaskUpdates } from "@/hooks/useTaskUpdates"
import { reorderTask } from "@/app/actions/tasks"
import { createList, deleteList } from "@/app/actions/lists"
import TaskBoard from "./TaskBoard"
import TaskListView from "./TaskListView"
import SmartListSidebar from "./SmartListSidebar"
import FilterBar, { type ViewMode } from "./FilterBar"
import CreateTaskForm from "./CreateTaskForm"

const SORT_KEYS: SortKey[] = ["manual", "due", "priority", "title"]

const parseLocalDate = (s: string | null): Date | null => {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const toYMD = (d?: Date | null): string | null =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    : null

/** Derive the full filter + view state from the URL search params. */
function parseState(sp: URLSearchParams): { filters: TaskFilters; view: ViewMode } {
  const horizonParam = sp.get("horizon")
  const horizon: DateHorizon = isDateHorizon(horizonParam) ? horizonParam : "all"
  const statuses = (sp.get("status") ?? "").split(",").filter(Boolean)
  const priorities = (sp.get("priority") ?? "").split(",").filter(Boolean)
  const query = sp.get("q") ?? ""
  const sortParam = sp.get("sort") as SortKey | null
  const sort: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : "manual"
  const from = parseLocalDate(sp.get("from"))
  const to = parseLocalDate(sp.get("to"))
  const custom = from || to ? { from, to } : undefined
  const view: ViewMode = sp.get("view") === "list" ? "list" : "board"
  const listParam = sp.get("list")
  const listId = listParam === "inbox" ? null : listParam ? listParam : undefined
  return { filters: { horizon, statuses, priorities, query, sort, custom, listId }, view }
}

interface TasksWorkspaceProps {
  tasks: Task[]
  lists: ListSummary[]
}

/**
 * The task workspace: a smart-list sidebar + filter bar wrapping switchable
 * views (board / list). All filter/view state is mirrored to the URL, so each
 * smart list is a shareable, refresh-surviving link. Optimistic task state and
 * AI-driven refresh are owned here and shared by every view.
 */
export default function TasksWorkspace({ tasks, lists }: TasksWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  const [now, setNow] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Client-only "now" so SSR stays deterministic (see `visible` below).
  useEffect(() => setNow(new Date()), [])
  // Keep optimistic state in sync with fresh server data.
  useEffect(() => setLocalTasks(tasks), [tasks])

  useTaskUpdates(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [router])

  const { filters, view } = useMemo(
    () => parseState(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )

  // Horizon filtering is the only time-dependent part; before mount we force
  // horizon "all" so server markup and first client render agree (no hydration
  // mismatch), then re-filter once `now` is set.
  const visible = useMemo(() => {
    const effective: TaskFilters = now
      ? filters
      : { ...filters, horizon: "all", custom: undefined }
    return applyFilters(localTasks, effective, now ?? new Date(0))
  }, [localTasks, filters, now])

  // Manual drag-reorder is only meaningful (and collision-safe) when the board
  // shows the complete, manually-ordered set — not a filtered subset.
  const reorderable =
    filters.horizon === "all" &&
    filters.statuses.length === 0 &&
    filters.priorities.length === 0 &&
    filters.query.trim() === "" &&
    !filters.custom &&
    filters.listId === undefined &&
    filters.sort === "manual"

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") params.delete(k)
        else params.set(k, v)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const handleFilterChange = useCallback(
    (patch: Partial<TaskFilters>) => {
      const p: Record<string, string | null> = {}
      if ("statuses" in patch) p.status = patch.statuses!.length ? patch.statuses!.join(",") : null
      if ("priorities" in patch) p.priority = patch.priorities!.length ? patch.priorities!.join(",") : null
      if ("query" in patch) p.q = patch.query || null
      if ("sort" in patch) p.sort = patch.sort === "manual" ? null : patch.sort ?? null
      if ("horizon" in patch) {
        p.horizon = patch.horizon === "all" ? null : patch.horizon ?? null
        if (patch.horizon !== "custom") {
          p.from = null
          p.to = null
        }
      }
      if ("custom" in patch) {
        p.horizon = "custom"
        p.from = toYMD(patch.custom?.from)
        p.to = toYMD(patch.custom?.to)
      }
      setParam(p)
    },
    [setParam]
  )

  const handleSelectHorizon = useCallback(
    (horizon: DateHorizon) =>
      setParam({ horizon: horizon === "all" ? null : horizon, from: null, to: null }),
    [setParam]
  )

  const handleViewChange = useCallback(
    (v: ViewMode) => setParam({ view: v === "board" ? null : v }),
    [setParam]
  )

  const handleSelectList = useCallback(
    (listId: string | null) => {
      // Toggle off when re-selecting the active list.
      const value = filters.listId === listId ? undefined : listId
      setParam({ list: value === undefined ? null : value === null ? "inbox" : value })
    },
    [filters.listId, setParam]
  )

  const handleCreateList = useCallback(
    (name: string) => {
      createList({ name }).then((res) => {
        if (res && "success" in res) router.refresh()
      })
    },
    [router]
  )

  const handleDeleteList = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this list? Its tasks move to the Inbox.")) return
      deleteList(id).then((res) => {
        if (res && "success" in res) {
          if (filters.listId === id) setParam({ list: null })
          router.refresh()
        }
      })
    },
    [router, filters.listId, setParam]
  )

  const handleReorder = useCallback(
    (id: string, newStatus: string, newOrder: number) => {
      // Optimistic: update the task in place; views re-derive from localTasks.
      setLocalTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: newStatus,
                order: newOrder,
                completedAt: isTerminalStatus(newStatus) ? t.completedAt ?? new Date() : null,
              }
            : t
        )
      )
      reorderTask({ id, newStatus, newOrder }).then((res) => {
        // Resync from the server if the persist failed, so optimistic state
        // doesn't drift.
        if (res && "error" in res && res.error) router.refresh()
      })
    },
    [router]
  )

  const handleUpdate = useCallback(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [router])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
            <p className="text-gray-600 mt-1">Manage and track your tasks</p>
          </div>
          {isRefreshing && (
            <div className="flex items-center gap-2 text-sm text-primary-600 animate-pulse">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Updating...
            </div>
          )}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
        >
          + New Task
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <SmartListSidebar
          tasks={localTasks}
          now={now}
          activeHorizon={filters.horizon}
          onSelectHorizon={handleSelectHorizon}
          lists={lists}
          activeListId={filters.listId}
          onSelectList={handleSelectList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
        />

        <div className="flex-1 min-w-0">
          <FilterBar
            filters={filters}
            view={view}
            onChange={handleFilterChange}
            onViewChange={handleViewChange}
          />

          {view === "board" ? (
            <TaskBoard
              tasks={visible}
              onReorder={handleReorder}
              onUpdate={handleUpdate}
              reorderable={reorderable}
            />
          ) : (
            <TaskListView tasks={visible} now={now} onUpdate={handleUpdate} />
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Task</h2>
            <CreateTaskForm
              onClose={() => setShowCreate(false)}
              lists={lists}
              defaultListId={typeof filters.listId === "string" ? filters.listId : ""}
            />
          </div>
        </div>
      )}
    </div>
  )
}
