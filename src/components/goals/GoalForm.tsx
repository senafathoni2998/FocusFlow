"use client"

import { useState } from "react"
import { createGoal, updateGoal } from "@/app/actions/goals"
import { GOAL_COLORS } from "@/types/goal"
import type { Goal } from "@/types/goal"

const COLOR_DOT: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

/** UTC-midnight Date -> yyyy-mm-dd (targetDate is keyed by calendar day). */
function toDateInput(d?: Date | string | null): string {
  if (!d) return ""
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

interface GoalFormProps {
  goal?: Goal
  onClose?: () => void
  onSaved?: () => void
}

export default function GoalForm({ goal, onClose, onSaved }: GoalFormProps) {
  const [title, setTitle] = useState(goal?.title ?? "")
  const [description, setDescription] = useState(goal?.description ?? "")
  const [icon, setIcon] = useState(goal?.icon ?? "🎯")
  const [color, setColor] = useState(goal?.color ?? "primary")
  const [progressType, setProgressType] = useState(goal?.progressType ?? "manual")
  const [targetValue, setTargetValue] = useState(String(goal?.targetValue ?? 10))
  const [unit, setUnit] = useState(goal?.unit ?? "")
  const [targetDate, setTargetDate] = useState(toDateInput(goal?.targetDate))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const isNumeric = progressType === "numeric"
    let target: number | null = null
    if (isNumeric) {
      target = Number(targetValue)
      if (!Number.isFinite(target) || target <= 0) {
        setError("Enter a target greater than 0")
        return
      }
    }

    setLoading(true)
    // Send explicit null (not undefined) so clearing a field actually clears it.
    const payload = {
      title,
      description: description || null,
      icon,
      color,
      progressType,
      targetValue: target,
      unit: isNumeric ? unit || null : null,
      targetDate: targetDate || null,
    }

    const res = goal ? await updateGoal(goal.id, payload) : await createGoal(payload)
    setLoading(false)

    if (res.error) {
      setError(res.error)
    } else {
      onSaved?.()
      onClose?.()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="flex gap-3 items-end">
        <div>
          <label htmlFor="goal-icon" className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
          <input
            id="goal-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={2}
            className="w-14 px-2 py-2 text-center border border-gray-300 rounded-lg text-lg outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="goal-title" className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
          <input
            id="goal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Read 12 books this year"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label htmlFor="goal-description" className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
        <textarea
          id="goal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Why does this matter?"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
        <div className="flex gap-2">
          {GOAL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`w-8 h-8 rounded-full ${COLOR_DOT[c]} ${
                color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="goal-progress" className="block text-sm font-medium text-gray-700 mb-2">Progress</label>
        <select
          id="goal-progress"
          value={progressType}
          onChange={(e) => setProgressType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
        >
          <option value="manual">Track by percent</option>
          <option value="numeric">Count toward a target</option>
        </select>
      </div>

      {progressType === "numeric" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="goal-target" className="block text-sm font-medium text-gray-700 mb-2">Target</label>
            <input
              id="goal-target"
              type="number"
              min="1"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
            />
          </div>
          <div>
            <label htmlFor="goal-unit" className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
            <input
              id="goal-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="books"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="goal-deadline" className="block text-sm font-medium text-gray-700 mb-2">Deadline</label>
        <input
          id="goal-deadline"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
        />
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
          {loading ? "Saving..." : goal ? "Save" : "Create Goal"}
        </button>
      </div>
    </form>
  )
}
