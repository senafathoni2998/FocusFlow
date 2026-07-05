"use client"

import { useState } from "react"
import { createHabit, updateHabit } from "@/app/actions/habits"
import { HABIT_COLORS, WEEKDAY_LABELS } from "@/types/habit"
import type { Habit } from "@/types/habit"

type FrequencyMode = "daily" | "weekdays" | "weekly"

/** Map an existing habit's stored frequency fields back to the form's mode. */
function initFrequency(habit?: Habit): FrequencyMode {
  if (habit?.frequencyType === "weekly") return "weekly"
  if (habit?.weekdays && habit.weekdays.length > 0) return "weekdays"
  return "daily"
}

const COLOR_DOT: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

const PRESETS = [
  { name: "Drink water", icon: "💧", goalType: "amount", targetAmount: 8, unit: "cups", color: "primary" },
  { name: "Read", icon: "📖", goalType: "achieve", color: "success" },
  { name: "Exercise", icon: "🏃", goalType: "achieve", color: "warning" },
  { name: "Meditate", icon: "🧘", goalType: "achieve", color: "primary" },
]

interface HabitFormProps {
  habit?: Habit
  onClose?: () => void
  onSaved?: () => void
}

export default function HabitForm({ habit, onClose, onSaved }: HabitFormProps) {
  const [name, setName] = useState(habit?.name ?? "")
  const [icon, setIcon] = useState(habit?.icon ?? "✅")
  const [color, setColor] = useState(habit?.color ?? "primary")
  const [goalType, setGoalType] = useState(habit?.goalType ?? "achieve")
  const [targetAmount, setTargetAmount] = useState(String(habit?.targetAmount ?? 1))
  const [unit, setUnit] = useState(habit?.unit ?? "")
  const [frequency, setFrequency] = useState<FrequencyMode>(initFrequency(habit))
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [])
  const [weeklyTarget, setWeeklyTarget] = useState(String(habit?.weeklyTarget ?? 3))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setName(p.name)
    setIcon(p.icon)
    setColor(p.color)
    setGoalType(p.goalType)
    if (p.targetAmount) setTargetAmount(String(p.targetAmount))
    setUnit(p.unit ?? "")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Resolve the three frequency modes back to the stored fields.
    let frequencyType = "daily"
    let payloadWeekdays: number[] = []
    let payloadWeeklyTarget = 1
    if (frequency === "weekdays") {
      if (weekdays.length === 0) {
        setError("Pick at least one day of the week.")
        return
      }
      payloadWeekdays = weekdays
    } else if (frequency === "weekly") {
      frequencyType = "weekly"
      payloadWeeklyTarget = Math.min(7, Math.max(1, Number(weeklyTarget) || 1))
    }

    setLoading(true)

    const payload = {
      name,
      icon,
      color,
      goalType,
      targetAmount: goalType === "amount" ? Number(targetAmount) || 1 : 1,
      unit: goalType === "amount" && unit ? unit : undefined,
      frequencyType,
      weekdays: payloadWeekdays,
      weeklyTarget: payloadWeeklyTarget,
    }

    const res = habit ? await updateHabit(habit.id, payload) : await createHabit(payload)
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

      {!habit && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div>
          <label htmlFor="habit-icon" className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
          <input
            id="habit-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={2}
            className="w-14 px-2 py-2 text-center border border-gray-300 rounded-lg text-lg outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="habit-name" className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
          <input
            id="habit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Habit name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
        <div className="flex gap-2">
          {HABIT_COLORS.map((c) => (
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
        <label htmlFor="habit-goal" className="block text-sm font-medium text-gray-700 mb-2">Goal</label>
        <select
          id="habit-goal"
          value={goalType}
          onChange={(e) => setGoalType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
        >
          <option value="achieve">Mark done each day</option>
          <option value="amount">Reach an amount</option>
        </select>
      </div>

      <div>
        <label htmlFor="habit-frequency" className="block text-sm font-medium text-gray-700 mb-2">
          Frequency
        </label>
        <select
          id="habit-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as FrequencyMode)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
        >
          <option value="daily">Every day</option>
          <option value="weekdays">Specific days of the week</option>
          <option value="weekly">A number of times per week</option>
        </select>
      </div>

      {frequency === "weekdays" && (
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">Which days?</span>
          <div className="flex gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => {
              const on = weekdays.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleWeekday(d)}
                  aria-label={label}
                  aria-pressed={on}
                  className={`w-9 h-9 rounded-full text-xs font-medium transition ${
                    on ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {frequency === "weekly" && (
        <div>
          <label htmlFor="habit-weekly-target" className="block text-sm font-medium text-gray-700 mb-2">
            Times per week
          </label>
          <input
            id="habit-weekly-target"
            type="number"
            min="1"
            max="7"
            value={weeklyTarget}
            onChange={(e) => setWeeklyTarget(e.target.value)}
            className="w-24 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
          />
        </div>
      )}

      {goalType === "amount" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="habit-target" className="block text-sm font-medium text-gray-700 mb-2">Target</label>
            <input
              id="habit-target"
              type="number"
              min="1"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700"
            />
          </div>
          <div>
            <label htmlFor="habit-unit" className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
            <input
              id="habit-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="cups"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400"
            />
          </div>
        </div>
      )}

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
          {loading ? "Saving..." : habit ? "Save" : "Create Habit"}
        </button>
      </div>
    </form>
  )
}
