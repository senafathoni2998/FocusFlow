"use client"

import { useState } from "react"
import { updateTask, deleteTask } from "@/app/actions/tasks"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import EditTaskForm from "./EditTaskForm"

interface TaskCardProps {
  task: {
    id: string
    title: string
    description?: string | null
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
        <div className="text-gray-600 text-sm mb-2 prose prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
              li: ({ children }) => <li className="mb-0">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              ),
            }}
          >
            {task.description}
          </ReactMarkdown>
        </div>
      )}

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

        <div className="flex gap-3">
          <button
            onClick={() => setIsEditing(true)}
            className="text-primary-600 hover:text-primary-800 text-sm"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-danger-600 hover:text-danger-800 text-sm disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Edit Task</h2>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <EditTaskForm
                task={task}
                onClose={() => setIsEditing(false)}
                onUpdate={onUpdate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
