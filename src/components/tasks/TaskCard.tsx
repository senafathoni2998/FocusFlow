"use client"

import { useState } from "react"
import { updateTask, deleteTask } from "@/app/actions/tasks"
import TaskNotes from "./TaskNotes"

interface TaskCardProps {
  task: {
    id: string
    title: string
    description?: string | null
    notes?: string | null
    status: string
    priority: string
    dueDate?: Date | null
  }
  onUpdate?: () => void
}

const priorityColors = {
  low: "bg-success-100 text-success-800 border-success-200",
  medium: "bg-warning-100 text-warning-800 border-warning-200",
  high: "bg-danger-100 text-danger-800 border-danger-200"
}

const statusColors = {
  todo: "bg-gray-100 text-gray-800",
  "in-progress": "bg-primary-100 text-primary-800",
  completed: "bg-success-100 text-success-800"
}

export default function TaskCard({ task, onUpdate }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    await updateTask(task.id, { status: newStatus })
    onUpdate?.()
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return

    setDeleting(true)
    await deleteTask(task.id)
    onUpdate?.()
  }

  const formatDate = (date: Date | null) => {
    if (!date) return null
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition ${task.status === "completed" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className={`font-semibold text-lg ${task.status === "completed" ? "line-through text-gray-500" : "text-gray-900"}`}>
          {task.title}
        </h3>
        <div className="flex gap-2">
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`text-xs px-2 py-1 rounded-full border ${statusColors[task.status as keyof typeof statusColors]} cursor-pointer`}
          >
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {task.description && (
        <p className="text-gray-600 text-sm mb-2">{task.description}</p>
      )}

      <TaskNotes notes={task.notes ?? null} />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <span className={`text-xs px-2 py-1 rounded-full border ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
          </span>
          {task.dueDate && (
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Due: {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-danger-600 hover:text-danger-800 text-sm disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  )
}
