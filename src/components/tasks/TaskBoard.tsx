"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
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
import CreateTaskForm from "./CreateTaskForm"
import { useTaskUpdates } from "@/hooks/useTaskUpdates"
import { reorderTask } from "@/app/actions/tasks"

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  dueDate?: Date | null
  order?: number | null
}

interface TaskBoardProps {
  tasks: Task[]
  onUpdate?: () => void
}

// Draggable wrapper for TaskCard
function DraggableTaskCard({ task, onUpdate }: { task: Task; onUpdate?: () => void }) {
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
      <TaskCard task={task} onUpdate={onUpdate} />
    </div>
  )
}

// Droppable column component
function Column({
  id,
  title,
  tasks,
  bgColor,
  titleColor,
  countColor,
  onUpdate,
}: {
  id: string
  title: string
  tasks: Task[]
  bgColor: string
  titleColor: string
  countColor: string
  onUpdate?: () => void
}) {
  const { setNodeRef } = useDroppable({ id })
  const taskIds = tasks.map((t) => t.id)

  return (
    <div ref={setNodeRef} className={`${bgColor} rounded-lg p-4 min-h-[500px]`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-semibold ${titleColor}`}>{title}</h2>
        <span className={`${countColor} text-xs px-2 py-1 rounded-full`}>
          {tasks.length}
        </span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {tasks.map((task) => (
            <DraggableTaskCard key={task.id} task={task} onUpdate={onUpdate} />
          ))}
          {tasks.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export default function TaskBoard({ tasks: initialTasks, onUpdate }: TaskBoardProps) {
  const router = useRouter()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filter, setFilter] = useState<"all" | "todo" | "in-progress" | "completed">("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | "low" | "medium" | "high">("all")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Local state for optimistic updates
  const [localTasks, setLocalTasks] = useState<Task[]>(initialTasks)

  // Update local tasks when initialTasks change from server
  useMemo(() => {
    setLocalTasks(initialTasks)
  }, [initialTasks])

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  )

  // Listen for task updates from AI assistant
  useTaskUpdates(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 500)
  }, [router])

  // Filter tasks - when filtering, disable drag and drop
  const isFiltering = filter !== "all" || priorityFilter !== "all"
  const filteredTasks = useMemo(() => {
    return localTasks.filter((task) => {
      if (filter !== "all" && task.status !== filter) return false
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false
      return true
    })
  }, [localTasks, filter, priorityFilter])

  // Group tasks by status (using all tasks, not filtered, for drag and drop)
  const tasksByStatus = useMemo(() => {
    return {
      todo: localTasks.filter((t) => t.status === "todo"),
      "in-progress": localTasks.filter((t) => t.status === "in-progress"),
      completed: localTasks.filter((t) => t.status === "completed"),
    }
  }, [localTasks])

  // Find active task for drag overlay
  const activeTask = useMemo(() => {
    return localTasks.find((t) => t.id === activeId)
  }, [localTasks, activeId])

  // Get column IDs for sortable context
  const columnIds = ["todo", "in-progress", "completed"]

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find the active task from local state
    const activeTask = localTasks.find((t) => t.id === activeId)
    if (!activeTask) return

    // Determine the new status (column)
    let newStatus = activeTask.status

    // If dropped on a column (not a task)
    if (columnIds.includes(overId)) {
      newStatus = overId
    } else {
      // If dropped on another task, use that task's status
      const overTask = localTasks.find((t) => t.id === overId)
      if (overTask) {
        newStatus = overTask.status
      }
    }

    // Calculate new order based on position in the new column
    const tasksInNewStatus = localTasks
      .filter((t) => t.status === newStatus && t.id !== activeId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))

    // Find the index where the task was dropped
    let newIndex = tasksInNewStatus.length
    if (overId !== activeId && !columnIds.includes(overId)) {
      const overIndex = tasksInNewStatus.findIndex((t) => t.id === overId)
      if (overIndex !== -1) {
        // Determine if we're dropping above or below the target card
        const activeRect = active.rect.current
        const overRect = over.rect

        if (activeRect && overRect) {
          const activeVerticalCenter = activeRect.top + activeRect.height / 2
          const overVerticalCenter = overRect.top + overRect.height / 2

          // If active card's center is below the target card's center, insert after
          if (activeVerticalCenter > overVerticalCenter) {
            newIndex = overIndex + 1
          } else {
            newIndex = overIndex
          }
        } else {
          newIndex = overIndex
        }
      }
    }

    // Calculate the new order value with proper spacing
    const BASE_ORDER = 10
    let newOrder: number
    if (newIndex === 0) {
      // First position - use half of the first task's order or base
      newOrder = tasksInNewStatus[0]?.order
        ? (tasksInNewStatus[0].order || 0) / 2
        : BASE_ORDER
    } else if (newIndex >= tasksInNewStatus.length) {
      // Last position
      const lastTask = tasksInNewStatus[tasksInNewStatus.length - 1]
      newOrder = (lastTask?.order || 0) + BASE_ORDER
    } else {
      // Middle position - average of surrounding tasks
      const prevOrder = tasksInNewStatus[newIndex - 1].order || (newIndex * BASE_ORDER)
      const nextOrder = tasksInNewStatus[newIndex].order || ((newIndex + 1) * BASE_ORDER)
      newOrder = prevOrder + (nextOrder - prevOrder) / 2
    }

    // OPTIMISTIC UPDATE: Reorder the array to match visual position
    setLocalTasks((prevTasks) => {
      // Remove the active task from its old position
      const otherTasks = prevTasks.filter((t) => t.id !== activeId)

      // Create the updated task
      const updatedTask = {
        ...activeTask,
        status: newStatus,
        order: newOrder,
      }

      // Separate tasks by status
      const tasksInTargetStatus = otherTasks
        .filter((t) => t.status === newStatus)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
      const otherStatusTasks = otherTasks.filter((t) => t.status !== newStatus)

      // Insert the task at the correct index
      tasksInTargetStatus.splice(newIndex, 0, updatedTask)

      // Combine back
      return [...otherStatusTasks, ...tasksInTargetStatus]
    })

    // Then sync with server in the background
    await reorderTask({
      id: activeId,
      newStatus,
      newOrder,
    })

    // Notify parent (triggers server refresh)
    onUpdate?.()
  }

  // Render filtered or draggable board
  if (isFiltering) {
    // Render filtered view (no drag and drop)
    const filteredByStatus = {
      todo: filteredTasks.filter((t) => t.status === "todo"),
      "in-progress": filteredTasks.filter((t) => t.status === "in-progress"),
      completed: filteredTasks.filter((t) => t.status === "completed"),
    }

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
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
          >
            + New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "all"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("todo")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "todo"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              To Do
            </button>
            <button
              onClick={() => setFilter("in-progress")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "in-progress"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "completed"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Completed
            </button>
          </div>

          <div className="flex gap-2 ml-auto">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-1 rounded-lg text-sm bg-gray-100 text-gray-700 border-none"
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Filtered Task Board (no drag and drop) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column
            id="todo"
            title="To Do"
            tasks={filteredByStatus.todo}
            bgColor="bg-gray-50"
            titleColor="text-gray-700"
            countColor="bg-gray-200 text-gray-700"
            onUpdate={onUpdate}
          />
          <Column
            id="in-progress"
            title="In Progress"
            tasks={filteredByStatus["in-progress"]}
            bgColor="bg-primary-50"
            titleColor="text-primary-700"
            countColor="bg-primary-200 text-primary-700"
            onUpdate={onUpdate}
          />
          <Column
            id="completed"
            title="Completed"
            tasks={filteredByStatus.completed}
            bgColor="bg-success-50"
            titleColor="text-success-700"
            countColor="bg-success-200 text-success-700"
            onUpdate={onUpdate}
          />
        </div>

        {/* Create Task Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Task</h2>
              <CreateTaskForm onClose={() => setShowCreateForm(false)} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Render full board with drag and drop
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
              <p className="text-gray-600 mt-1">Manage and track your tasks (drag to reorder)</p>
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
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
          >
            + New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "all"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("todo")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "todo"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              To Do
            </button>
            <button
              onClick={() => setFilter("in-progress")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "in-progress"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-3 py-1 rounded-lg text-sm transition ${
                filter === "completed"
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Completed
            </button>
          </div>

          <div className="flex gap-2 ml-auto">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-1 rounded-lg text-sm bg-gray-100 text-gray-700 border-none"
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Task Board with Drag and Drop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column
            id="todo"
            title="To Do"
            tasks={tasksByStatus.todo}
            bgColor="bg-gray-50"
            titleColor="text-gray-700"
            countColor="bg-gray-200 text-gray-700"
            onUpdate={onUpdate}
          />
          <Column
            id="in-progress"
            title="In Progress"
            tasks={tasksByStatus["in-progress"]}
            bgColor="bg-primary-50"
            titleColor="text-primary-700"
            countColor="bg-primary-200 text-primary-700"
            onUpdate={onUpdate}
          />
          <Column
            id="completed"
            title="Completed"
            tasks={tasksByStatus.completed}
            bgColor="bg-success-50"
            titleColor="text-success-700"
            countColor="bg-success-200 text-success-700"
            onUpdate={onUpdate}
          />
        </div>

        {/* Create Task Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Task</h2>
              <CreateTaskForm onClose={() => setShowCreateForm(false)} />
            </div>
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-50 rotate-3 pointer-events-none">
            <TaskCard task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
