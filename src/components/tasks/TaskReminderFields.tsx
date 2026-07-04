"use client"

import { useState } from "react"

interface TaskReminderFieldsProps {
  reminders: string[] // datetime-local strings ("YYYY-MM-DDTHH:mm")
  onChange: (reminders: string[]) => void
}

/** Add/remove absolute reminder times for a task (shared by the create/edit forms). */
export default function TaskReminderFields({ reminders, onChange }: TaskReminderFieldsProps) {
  const [value, setValue] = useState("")

  const add = () => {
    if (value && !reminders.includes(value)) onChange([...reminders, value])
    setValue("")
  }

  return (
    <div>
      <label htmlFor="reminder-time" className="block text-sm font-medium text-gray-700 mb-2">
        Reminders
      </label>

      {reminders.length > 0 && (
        <ul className="space-y-1 mb-2">
          {reminders.map((r, i) => (
            <li key={r} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="flex-1">🔔 {r.replace("T", " ")}</span>
              <button
                type="button"
                onClick={() => onChange(reminders.filter((_, j) => j !== i))}
                aria-label={`Remove reminder ${r}`}
                className="text-gray-400 hover:text-danger-600 text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          id="reminder-time"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Reminder time"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition text-gray-700"
        />
        <button
          type="button"
          onClick={add}
          disabled={!value}
          aria-label="Add reminder"
          className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Add
        </button>
      </div>
    </div>
  )
}
