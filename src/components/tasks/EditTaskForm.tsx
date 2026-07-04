"use client"

import { useState, useRef, useEffect } from "react"
import { updateTask, createTask, deleteTask } from "@/app/actions/tasks"
import { getLists } from "@/app/actions/lists"
import { getGoalOptions } from "@/app/actions/goals"
import type { ListSummary, Task, TagSummary, RecurrenceSummary, ReminderSummary } from "@/types/task"
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

interface EditTaskFormProps {
  task: {
    id: string
    title: string
    description?: string | null
    priority: string
    dueDate?: Date | null
    listId?: string | null
    goalId?: string | null
    tags?: TagSummary[]
    recurrence?: RecurrenceSummary | null
    reminders?: ReminderSummary[]
  }
  subtasks?: Task[]
  onClose?: () => void
  onUpdate?: () => void
}

// Format a stored Date to the local YYYY-MM-DD a <input type="date"> expects.
// Using local getFullYear/getMonth/getDate (not toISOString, which is UTC) so a
// date stored at local midnight doesn't shift a day in offset timezones.
const toDateInputValue = (date: Date | string): string => {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Stored reminder instant -> local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">.
const toDateTimeLocal = (date: Date | string): string => {
  const d = new Date(date)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function EditTaskForm({ task, subtasks, onClose, onUpdate }: EditTaskFormProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(
    task.dueDate ? toDateInputValue(task.dueDate) : ""
  )
  const [listId, setListId] = useState(task.listId ?? "")
  const [goalId, setGoalId] = useState(task.goalId ?? "")
  const [tags, setTags] = useState((task.tags ?? []).map((t) => t.name).join(", "))
  const [recurrence, setRecurrence] = useState(task.recurrence?.freq ?? "")
  const [reminders, setReminders] = useState<string[]>(
    (task.reminders ?? []).map((r) => toDateTimeLocal(r.triggerAt))
  )
  const [lists, setLists] = useState<ListSummary[]>([])
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [newSubtask, setNewSubtask] = useState("")
  const [subtaskBusy, setSubtaskBusy] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    getLists().then(setLists)
    getGoalOptions().then(setGoals)
  }, [])

  const addSubtask = async () => {
    const t = newSubtask.trim()
    if (!t || subtaskBusy) return
    setSubtaskBusy(true)
    await createTask({ title: t, parentTaskId: task.id, listId: task.listId ?? undefined })
    setNewSubtask("")
    setSubtaskBusy(false)
    onUpdate?.()
  }

  const toggleSubtask = async (sub: Task) => {
    await updateTask(sub.id, { status: sub.status === "completed" ? "todo" : "completed" })
    onUpdate?.()
  }

  const removeSubtask = async (id: string) => {
    await deleteTask(id)
    onUpdate?.()
  }

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
      listId: listId || null,
      goalId: goalId || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      reminders,
      recurrence: recurrence || null,
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
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
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

      <div>
        <label htmlFor="edit-list" className="block text-sm font-medium text-gray-700 mb-2">
          List
        </label>
        <select
          id="edit-list"
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
          <label htmlFor="edit-goal" className="block text-sm font-medium text-gray-700 mb-2">
            Goal
          </label>
          <select
            id="edit-goal"
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
        <label htmlFor="edit-tags" className="block text-sm font-medium text-gray-700 mb-2">
          Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <input
          id="edit-tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="work, urgent"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label htmlFor="edit-recurrence" className="block text-sm font-medium text-gray-700 mb-2">
          Repeat
        </label>
        <select
          id="edit-recurrence"
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Subtasks</label>
        {subtasks && subtasks.length > 0 ? (
          <ul className="space-y-1 mb-2">
            {subtasks.map((sub) => (
              <li key={sub.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sub.status === "completed"}
                  onChange={() => toggleSubtask(sub)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  aria-label={`Complete subtask ${sub.title}`}
                />
                <span
                  className={`flex-1 text-sm ${sub.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}
                >
                  {sub.title}
                </span>
                <button
                  type="button"
                  onClick={() => removeSubtask(sub.id)}
                  aria-label={`Delete subtask ${sub.title}`}
                  className="text-gray-400 hover:text-danger-600 text-xs"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 mb-2">No subtasks yet.</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addSubtask()
              }
            }}
            placeholder="Add a subtask…"
            aria-label="Add a subtask"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={addSubtask}
            disabled={subtaskBusy || !newSubtask.trim()}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Add
          </button>
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
