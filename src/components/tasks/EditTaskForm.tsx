"use client"

import { useState, useRef } from "react"
import { updateTask } from "@/app/actions/tasks"

// Helper function to insert markdown around selected text
const insertMarkdown = (
  textarea: HTMLTextAreaElement,
  setValue: (value: string) => void,
  currentValue: string,
  before: string,
  after: string
) => {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = currentValue.substring(start, end)

  const newText =
    currentValue.substring(0, start) +
    before +
    selectedText +
    after +
    currentValue.substring(end)

  setValue(newText)

  // Set cursor position after the inserted markdown
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(
      start + before.length,
      end + before.length
    )
  }, 0)
}

interface EditTaskFormProps {
  task: {
    id: string
    title: string
    description?: string | null
    priority: string
    dueDate?: Date | null
  }
  onClose?: () => void
  onUpdate?: () => void
}

export default function EditTaskForm({ task, onClose, onUpdate }: EditTaskFormProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  )
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

    if (cmdOrCtrl) {
      if (e.key === "b") {
        e.preventDefault()
        insertMarkdown(textarea, setDescription, description, "**", "**")
      } else if (e.key === "i") {
        e.preventDefault()
        insertMarkdown(textarea, setDescription, description, "*", "*")
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await updateTask(task.id, {
      title,
      description,
      priority,
      dueDate,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      onUpdate?.()
      onClose?.()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-2">
          Title *
        </label>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400"
          placeholder="Task title"
        />
      </div>

      <div>
        <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-2">
          Description <span className="text-gray-400 font-normal">(supports Markdown - Ctrl+B bold, Ctrl+I italic)</span>
        </label>
        <textarea
          ref={descriptionRef}
          id="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition resize-none text-gray-700 placeholder:text-gray-400 font-mono text-sm"
          placeholder="- Add bullet points&#10;- **Bold** and *italic* text&#10;- # Headers&#10;- Links: [text](url)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="edit-priority" className="block text-sm font-medium text-gray-700 mb-2">
            Priority
          </label>
          <select
            id="edit-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label htmlFor="edit-dueDate" className="block text-sm font-medium text-gray-700 mb-2">
            Due Date
          </label>
          <input
            id="edit-dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  )
}
