"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Task, ListSummary, TagSummary, SavedFilterSummary } from "@/types/task"
import type { GoalOption } from "@/types/goal"
import {
  applyFilters,
  type TaskFilters,
  type SortKey,
} from "@/lib/taskFilters"
import { type DateHorizon, isDateHorizon } from "@/lib/dateHorizon"
import { canonicalizeQuery } from "@/lib/savedFilters"
import { isTerminalStatus } from "@/lib/taskConstants"
import { useTaskUpdates } from "@/hooks/useTaskUpdates"
import { reorderTask, completeTask } from "@/app/actions/tasks"
import { createList, deleteList } from "@/app/actions/lists"
import { createSavedFilter, deleteSavedFilter } from "@/app/actions/savedFilters"
import { deleteTag } from "@/app/actions/tags"
import { groupSubtasksByParent, topLevelTasks } from "@/lib/subtasks"
import TaskBoard from "./TaskBoard"
import TaskListView from "./TaskListView"
import TaskCalendarView from "./TaskCalendarView"
import TaskMatrixView from "./TaskMatrixView"
import SmartListSidebar from "./SmartListSidebar"
import FilterBar, { type ViewMode } from "./FilterBar"
import CreateTaskForm from "./CreateTaskForm"
import QuickAddBar from "./QuickAddBar"

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
  const viewParam = sp.get("view")
  const view: ViewMode =
    viewParam === "list" || viewParam === "calendar" || viewParam === "matrix"
      ? viewParam
      : "board"
  const listParam = sp.get("list")
  const listId = listParam === "inbox" ? null : listParam ? listParam : undefined
  const tags = (sp.get("tags") ?? "").split(",").filter(Boolean)
  return { filters: { horizon, statuses, priorities, query, sort, custom, listId, tags }, view }
}

interface TasksWorkspaceProps {
  tasks: Task[]
  lists: ListSummary[]
  allTags: TagSummary[]
  goals: GoalOption[]
  savedFilters: SavedFilterSummary[]
}

/**
 * The task workspace: a smart-list sidebar + filter bar wrapping switchable
 * views (board / list). All filter/view state is mirrored to the URL, so each
 * smart list is a shareable, refresh-surviving link. Optimistic task state and
 * AI-driven refresh are owned here and shared by every view.
 */
export default function TasksWorkspace({
  tasks,
  lists,
  allTags,
  goals,
  savedFilters = [],
}: TasksWorkspaceProps) {
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

  // Canonical form of the current view's query — used to save it and to highlight
  // the matching saved view. Matches the server's canonicalization exactly.
  const currentQuery = useMemo(
    () => canonicalizeQuery(searchParams.toString()),
    [searchParams]
  )
  const activeSavedId = useMemo(
    () => savedFilters.find((f) => f.query === currentQuery)?.id ?? null,
    [savedFilters, currentQuery]
  )

  // Subtasks (tasks with a parent) never appear as top-level cards; they surface
  // inside their parent. Views operate on top-level tasks; each parent's children
  // are threaded to its card.
  const topLevel = useMemo(() => topLevelTasks(localTasks), [localTasks])
  const subtasksByParent = useMemo(() => groupSubtasksByParent(localTasks), [localTasks])

  // Calendar and matrix views group tasks by date / urgency themselves, so the
  // horizon filter (and the custom range) don't apply — they'd conflict with the
  // calendar's own month navigation and the matrix's quadrants.
  const isDateView = view === "calendar" || view === "matrix"

  // Horizon filtering is the only time-dependent part; before mount we force
  // horizon "all" so server markup and first client render agree (no hydration
  // mismatch), then re-filter once `now` is set. Date views always force it off.
  const visible = useMemo(() => {
    const effective: TaskFilters =
      now && !isDateView ? filters : { ...filters, horizon: "all", custom: undefined }
    return applyFilters(topLevel, effective, now ?? new Date(0))
  }, [topLevel, filters, now, isDateView])

  // Manual drag-reorder is only meaningful (and collision-safe) when the board
  // shows the complete, manually-ordered set — not a filtered subset.
  const reorderable =
    filters.horizon === "all" &&
    filters.statuses.length === 0 &&
    filters.priorities.length === 0 &&
    filters.query.trim() === "" &&
    !filters.custom &&
    filters.listId === undefined &&
    filters.tags.length === 0 &&
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
      if ("tags" in patch) p.tags = patch.tags!.length ? patch.tags!.join(",") : null
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

  const handleDeleteTag = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this tag? It will be removed from all tasks.")) return
      deleteTag(id).then((res) => {
        if (res && "success" in res) {
          if (filters.tags.includes(id)) {
            setParam({ tags: filters.tags.filter((t) => t !== id).join(",") || null })
          }
          router.refresh()
        }
      })
    },
    [router, filters.tags, setParam]
  )

  // Save the current view under a name. Returns the action result so the sidebar
  // can surface a duplicate-name error inline.
  const handleSaveFilter = useCallback(
    async (name: string) => {
      const res = await createSavedFilter({ name, query: currentQuery })
      if (res && "success" in res) router.refresh()
      return res
    },
    [currentQuery, router]
  )

  const handleApplyFilter = useCallback(
    (query: string) => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname]
  )

  const handleDeleteFilter = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this saved view?")) return
      deleteSavedFilter(id).then((res) => {
        if (res && "success" in res) router.refresh()
      })
    },
    [router]
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
      if (newStatus === "completed") {
        // Route completion through completeTask so a recurring task rolls forward
        // (the refresh reconciles the optimistic "completed" back to its next
        // occurrence).
        completeTask(id).then(() => router.refresh())
        return
      }
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

      <QuickAddBar onCreated={handleUpdate} listId={filters.listId} />

      <div className="flex flex-col lg:flex-row gap-6">
        <SmartListSidebar
          tasks={topLevel}
          now={now}
          activeHorizon={filters.horizon}
          onSelectHorizon={handleSelectHorizon}
          lists={lists}
          activeListId={filters.listId}
          onSelectList={handleSelectList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
          savedFilters={savedFilters}
          activeSavedId={activeSavedId}
          onSaveFilter={handleSaveFilter}
          onApplyFilter={handleApplyFilter}
          onDeleteFilter={handleDeleteFilter}
        />

        <div className="flex-1 min-w-0">
          <FilterBar
            filters={filters}
            view={view}
            onChange={handleFilterChange}
            onViewChange={handleViewChange}
            allTags={allTags}
            onDeleteTag={handleDeleteTag}
          />

          {view === "board" ? (
            <TaskBoard
              tasks={visible}
              onReorder={handleReorder}
              onUpdate={handleUpdate}
              reorderable={reorderable}
              subtasksByParent={subtasksByParent}
            />
          ) : view === "list" ? (
            <TaskListView
              tasks={visible}
              now={now}
              onUpdate={handleUpdate}
              subtasksByParent={subtasksByParent}
            />
          ) : view === "calendar" ? (
            <TaskCalendarView
              tasks={visible}
              now={now}
              onUpdate={handleUpdate}
              subtasksByParent={subtasksByParent}
            />
          ) : (
            <TaskMatrixView
              tasks={visible}
              now={now}
              onUpdate={handleUpdate}
              subtasksByParent={subtasksByParent}
            />
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
              goals={goals}
              defaultListId={typeof filters.listId === "string" ? filters.listId : ""}
            />
          </div>
        </div>
      )}
    </div>
  )
}
