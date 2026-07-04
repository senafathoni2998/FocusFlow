"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { Habit } from "@/types/habit"
import { checkInHabit, deleteHabit } from "@/app/actions/habits"
import HabitRow from "./HabitRow"
import HabitForm from "./HabitForm"

const utcKey = (d: Date | string) => {
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

const todayLocalParts = () => {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}

export default function HabitBoard({ habits }: { habits: Habit[] }) {
  const router = useRouter()
  const [localHabits, setLocalHabits] = useState<Habit[]>(habits)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => setLocalHabits(habits), [habits])

  const handleCheckIn = useCallback(
    (habitId: string, delta: number) => {
      const { y, m, d } = todayLocalParts()
      const todayDate = new Date(Date.UTC(y, m, d))
      const tKey = utcKey(todayDate)
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

      // Optimistic: adjust today's check-in in place.
      setLocalHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h
          const checkIns = [...(h.checkIns ?? [])]
          const idx = checkIns.findIndex((c) => utcKey(c.date) === tKey)
          if (idx >= 0) {
            const amt = Math.max(0, checkIns[idx].amount + delta)
            if (amt <= 0) checkIns.splice(idx, 1)
            else checkIns[idx] = { ...checkIns[idx], amount: amt }
          } else if (delta > 0) {
            checkIns.push({ id: `optim-${tKey}`, date: todayDate, amount: delta })
          }
          return { ...h, checkIns }
        })
      )

      setBusyId(habitId)
      checkInHabit({ habitId, date: dateStr, delta })
        .then(() => router.refresh())
        .catch(() => router.refresh())
        .finally(() => setBusyId(null))
    },
    [router]
  )

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this habit and its history?")) return
      setLocalHabits((prev) => prev.filter((h) => h.id !== id))
      deleteHabit(id)
        .then(() => router.refresh())
        .catch(() => router.refresh())
    },
    [router]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Habits</h1>
          <p className="text-gray-600 mt-1">Build streaks, one check-in at a time</p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
        >
          + New Habit
        </button>
      </div>

      {localHabits.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No habits yet. Create one to start building streaks.
        </div>
      ) : (
        <div className="space-y-2">
          {localHabits.map((h) => (
            <HabitRow
              key={h.id}
              habit={h}
              busy={busyId === h.id}
              onCheckIn={(delta) => handleCheckIn(h.id, delta)}
              onEdit={() => {
                setEditing(h)
                setShowForm(true)
              }}
              onDelete={() => handleDelete(h.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {editing ? "Edit Habit" : "New Habit"}
            </h2>
            <HabitForm
              habit={editing ?? undefined}
              onClose={() => setShowForm(false)}
              onSaved={() => router.refresh()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
