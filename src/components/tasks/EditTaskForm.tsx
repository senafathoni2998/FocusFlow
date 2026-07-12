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

  // "Tell AI what to change" box: sends a natural-language instruction to the
  // AI, which returns a field-change delta. We only pre-fill the form with it —
  // the user reviews and hits Save (the normal updateTask path) to persist.
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState("")
  const [aiChanged, setAiChanged] = useState<string[]>([])

  const applyAiEdit = async () => {
    const text = aiInstruction.trim()
    if (!text || aiLoading) return
    setAiLoading(true)
    setAiError("")
    setAiChanged([])
    try {
      const res = await fetch("/api/ai/task-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, instruction: text }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setAiError(
          data.message || data.error || "AI couldn't apply that. Try rephrasing."
        )
        return
      }

      // Apply only the fields the endpoint returned (a partial delta), tracking
      // which ones changed so we can show the user what to review before saving.
      const changes = data.changes ?? {}
      const changed: string[] = []
      if (typeof changes.title === "string") {
        setTitle(changes.title)
        changed.push("Title")
      }
      if (typeof changes.description === "string") {
        setDescription(changes.description)
        changed.push("Description")
      }
      if (typeof changes.priority === "string") {
        setPriority(changes.priority)
        changed.push("Priority")
      }
      if (typeof changes.dueDate === "string") {
        setDueDate(changes.dueDate)
        changed.push("Due date")
      }
      if (changes.listId !== undefined) {
        setListId(changes.listId ?? "")
        changed.push("List")
      }
      if (changes.goalId !== undefined) {
        setGoalId(changes.goalId ?? "")
        changed.push("Goal")
      }
      if (Array.isArray(changes.tags)) {
        // The AI returns the FULL resulting tag set, so a partial reply could drop
        // existing tags. Make any removal explicit in the review note (the field
        // shows the new set, but removals are easy to miss) so it can't be a silent
        // loss when the user hits Save.
        const currentTags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
        const nextTags: string[] = changes.tags
        const removed = currentTags.filter(
          (t) => !nextTags.some((n) => n.toLowerCase() === t.toLowerCase()),
        )
        setTags(nextTags.join(", "))
        let label = nextTags.length ? `Tags (${nextTags.join(", ")})` : "Tags (cleared)"
        if (removed.length) label += ` [removed: ${removed.join(", ")}]`
        changed.push(label)
      }
      if (changes.recurrence !== undefined) {
        setRecurrence(changes.recurrence ?? "")
        changed.push("Repeat")
      }

      if (changed.length === 0) {
        setAiError("AI didn't find anything to change. Try being more specific.")
      } else {
        setAiChanged(changed)
        setAiInstruction("")
      }
    } catch {
      setAiError("Couldn't reach the AI. Check your connection and try again.")
    } finally {
      setAiLoading(false)
    }
  }

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

      <div className="rounded-lg border border-primary-200 bg-primary-50/60 p-3">
        <label htmlFor="edit-ai" className="block text-sm font-medium text-primary-800 mb-2">
          ✨ Tell AI what to change
        </label>
        <div className="flex gap-2">
          <input
            id="edit-ai"
            type="text"
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            onKeyDown={(e) => {
              // Keep Enter here from submitting the whole form — run the AI edit instead.
              if (e.key === "Enter") {
                e.preventDefault()
                applyAiEdit()
              }
            }}
            disabled={aiLoading}
            aria-busy={aiLoading}
            placeholder="e.g. push to next Friday and mark high priority"
            className="flex-1 px-3 py-2 text-sm border border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700 placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={applyAiEdit}
            disabled={aiLoading || !aiInstruction.trim()}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
          >
            {aiLoading ? "Thinking…" : "Apply"}
          </button>
        </div>
        {aiError && (
          <p role="alert" className="mt-2 text-sm text-danger-600">
            {aiError}
          </p>
        )}
        {aiChanged.length > 0 && (
          <p role="status" className="mt-2 text-sm text-primary-700">
            AI updated: {aiChanged.join(", ")} — review and Save.
          </p>
        )}
      </div>

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
