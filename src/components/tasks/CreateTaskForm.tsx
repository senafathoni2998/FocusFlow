"use client"

import { useState, useRef } from "react"
import { createTask } from "@/app/actions/tasks"
import type { ListSummary } from "@/types/task"
import type { GoalOption } from "@/types/goal"
import { RECURRENCE_FREQS, RECURRENCE_LABELS } from "@/lib/recurrence"
import TaskReminderFields from "./TaskReminderFields"

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

interface CreateTaskFormProps {
  onClose?: () => void
  lists?: ListSummary[]
  goals?: GoalOption[]
  defaultListId?: string
}

export default function CreateTaskForm({ onClose, lists = [], goals = [], defaultListId = "" }: CreateTaskFormProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [dueDate, setDueDate] = useState("")
  const [listId, setListId] = useState(defaultListId)
  const [goalId, setGoalId] = useState("")
  const [tags, setTags] = useState("")
  const [recurrence, setRecurrence] = useState("")
  const [reminders, setReminders] = useState<string[]>([])
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await createTask({
      title,
      description,
      priority,
      dueDate,
      listId: listId || undefined,
      goalId: goalId || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      reminders,
      recurrence: recurrence || null,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setTitle("")
      setDescription("")
      setPriority("medium")
      setDueDate("")
      setListId(defaultListId)
      setGoalId("")
      setTags("")
      setRecurrence("")
      setReminders([])
      setLoading(false)
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
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
          Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400"
          placeholder="Task title"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
          Description <span className="text-gray-400 font-normal">(supports Markdown - Ctrl+B bold, Ctrl+I italic)</span>
        </label>
        <textarea
          ref={descriptionRef}
          id="description"
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
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </div>

        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
            Due Date
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
          />
        </div>
      </div>

      <div>
        <label htmlFor="list" className="block text-sm font-medium text-gray-700 mb-2">
          List
        </label>
        <select
          id="list"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
        >
          <option value="">Inbox</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {goals.length > 0 && (
        <div>
          <label htmlFor="goal" className="block text-sm font-medium text-gray-700 mb-2">
            Goal
          </label>
          <select
            id="goal"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
          >
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon} {g.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
          Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <input
          id="tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="work, urgent"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label htmlFor="recurrence" className="block text-sm font-medium text-gray-700 mb-2">
          Repeat
        </label>
        <select
          id="recurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
        >
          <option value="">Does not repeat</option>
          {RECURRENCE_FREQS.map((f) => (
            <option key={f} value={f}>
              {RECURRENCE_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      <TaskReminderFields reminders={reminders} onChange={setReminders} />

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
          {loading ? "Creating..." : "Create Task"}
        </button>
      </div>
    </form>
  )
}
