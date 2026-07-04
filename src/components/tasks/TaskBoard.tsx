"use client"

import { useState, useMemo } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import TaskCard from "./TaskCard"
import type { Task } from "@/types/task"

/**
 * Controlled Kanban board. Renders the three status columns for whatever
 * (already-filtered) tasks it's given and reports drags up via `onReorder`;
 * all filter/view/header state lives in TasksWorkspace.
 *
 * Drag-reordering is only enabled when `reorderable` is true — i.e. when the
 * board is showing the COMPLETE, manually-ordered task set. While a filter hides
 * some tasks, reorder math can't see them and would collide order values, so the
 * board renders a static (non-draggable) view instead.
 */

const COLUMNS = [
  { id: "todo", title: "To Do", bgColor: "bg-gray-50", titleColor: "text-gray-700", countColor: "bg-gray-200 text-gray-700" },
  { id: "in-progress", title: "In Progress", bgColor: "bg-primary-50", titleColor: "text-primary-700", countColor: "bg-primary-200 text-primary-700" },
  { id: "completed", title: "Completed", bgColor: "bg-success-50", titleColor: "text-success-700", countColor: "bg-success-200 text-success-700" },
]
const COLUMN_IDS: string[] = COLUMNS.map((c) => c.id)
const ORDER_STEP = 10

type ColumnDef = (typeof COLUMNS)[number]

interface TaskBoardProps {
  tasks: Task[]
  onReorder: (id: string, newStatus: string, newOrder: number) => void
  onUpdate?: () => void
  /** Enable drag-and-drop reordering (only when the full set is shown). */
  reorderable?: boolean
  /** parentTaskId -> its subtasks, for the per-card progress badge / checklist. */
  subtasksByParent?: Record<string, Task[]>
}

function DraggableTaskCard({ task, subtasks, onUpdate }: { task: Task; subtasks?: Task[]; onUpdate?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} subtasks={subtasks} onUpdate={onUpdate} />
    </div>
  )
}

function ColumnHeader({ col, count }: { col: ColumnDef; count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className={`font-semibold ${col.titleColor}`}>{col.title}</h2>
      <span className={`${col.countColor} text-xs px-2 py-1 rounded-full`}>{count}</span>
    </div>
  )
}

function DndColumn({
  col,
  tasks,
  subtasksByParent,
  onUpdate,
}: {
  col: ColumnDef
  tasks: Task[]
  subtasksByParent?: Record<string, Task[]>
  onUpdate?: () => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const taskIds = tasks.map((t) => t.id)

  return (
    <div ref={setNodeRef} className={`${col.bgColor} rounded-lg p-4 min-h-[500px]`}>
      <ColumnHeader col={col} count={tasks.length} />
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              subtasks={subtasksByParent?.[task.id]}
              onUpdate={onUpdate}
            />
          ))}
          {tasks.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function StaticColumn({
  col,
  tasks,
  subtasksByParent,
  onUpdate,
}: {
  col: ColumnDef
  tasks: Task[]
  subtasksByParent?: Record<string, Task[]>
  onUpdate?: () => void
}) {
  return (
    <div className={`${col.bgColor} rounded-lg p-4 min-h-[500px]`}>
      <ColumnHeader col={col} count={tasks.length} />
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} subtasks={subtasksByParent?.[task.id]} onUpdate={onUpdate} />
        ))}
        {tasks.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
        )}
      </div>
    </div>
  )
}

export default function TaskBoard({
  tasks,
  onReorder,
  onUpdate,
  reorderable = true,
  subtasksByParent,
}: TaskBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Group displayed tasks into the three status columns, each ordered by `order`.
  const tasksByStatus = useMemo(() => {
    const by: Record<string, Task[]> = {}
    for (const c of COLUMNS) by[c.id] = []
    for (const t of tasks) {
      if (by[t.status]) by[t.status].push(t)
    }
    for (const id of COLUMN_IDS) {
      by[id].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return by
  }, [tasks])

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId]
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeIdStr = active.id as string
    const overId = over.id as string

    const activeTaskLocal = tasks.find((t) => t.id === activeIdStr)
    if (!activeTaskLocal) return

    // Determine the target column (status)
    let newStatus = activeTaskLocal.status
    if (COLUMN_IDS.includes(overId)) {
      newStatus = overId
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      if (overTask) newStatus = overTask.status
    }

    // Position within the target column (excluding the dragged task)
    const tasksInNewStatus = tasks
      .filter((t) => t.status === newStatus && t.id !== activeIdStr)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    let newIndex = tasksInNewStatus.length
    if (overId !== activeIdStr && !COLUMN_IDS.includes(overId)) {
      const overIndex = tasksInNewStatus.findIndex((t) => t.id === overId)
      if (overIndex !== -1) {
        const activeRect = active.rect.current?.translated ?? active.rect.current?.initial ?? null
        const overRect = over.rect ?? null
        if (activeRect && overRect) {
          const activeCenter = activeRect.top + activeRect.height / 2
          const overCenter = overRect.top + overRect.height / 2
          newIndex = activeCenter > overCenter ? overIndex + 1 : overIndex
        } else {
          newIndex = overIndex
        }
      }
    }

    // Integer fractional ordering (order is an Int column). `order` values are
    // seeded spaced by ORDER_STEP on create, leaving room to insert between.
    const orderOf = (t?: Task) => (t && t.order != null ? t.order : null)
    let newOrder: number
    if (newIndex <= 0) {
      const firstOrder = orderOf(tasksInNewStatus[0])
      newOrder = firstOrder != null ? firstOrder - ORDER_STEP : 0
    } else if (newIndex >= tasksInNewStatus.length) {
      const lastOrder = orderOf(tasksInNewStatus[tasksInNewStatus.length - 1])
      newOrder = (lastOrder ?? (tasksInNewStatus.length - 1) * ORDER_STEP) + ORDER_STEP
    } else {
      const prevOrder = orderOf(tasksInNewStatus[newIndex - 1]) ?? (newIndex - 1) * ORDER_STEP
      const nextOrder = orderOf(tasksInNewStatus[newIndex]) ?? newIndex * ORDER_STEP
      newOrder = Math.round((prevOrder + nextOrder) / 2)
    }

    onReorder(activeIdStr, newStatus, newOrder)
  }

  // Filtered view: render a static (non-draggable) board.
  if (!reorderable) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => (
          <StaticColumn
            key={col.id}
            col={col}
            tasks={tasksByStatus[col.id]}
            subtasksByParent={subtasksByParent}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => (
          <DndColumn
            key={col.id}
            col={col}
            tasks={tasksByStatus[col.id]}
            subtasksByParent={subtasksByParent}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="opacity-50 rotate-3 pointer-events-none">
            <TaskCard task={activeTask} subtasks={subtasksByParent?.[activeTask.id]} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
