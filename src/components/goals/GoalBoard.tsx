"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { Goal } from "@/types/goal"
import { adjustGoalProgress, setGoalStatus, deleteGoal } from "@/app/actions/goals"
import GoalCard from "./GoalCard"
import GoalForm from "./GoalForm"

const clampAdjust = (goal: Goal, delta: number): Partial<Goal> => {
  if (goal.progressType === "numeric") {
    return { currentValue: Math.max(0, Math.min(1_000_000, goal.currentValue + delta)) }
  }
  return { manualProgress: Math.max(0, Math.min(100, Math.round(goal.manualProgress + delta))) }
}

export default function GoalBoard({ goals }: { goals: Goal[] }) {
  const router = useRouter()
  const [localGoals, setLocalGoals] = useState<Goal[]>(goals)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => setLocalGoals(goals), [goals])

  const handleAdjust = useCallback(
    (goalId: string, delta: number) => {
      setLocalGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, ...clampAdjust(g, delta) } : g)))
      setBusyId(goalId)
      adjustGoalProgress(goalId, delta)
        .then(() => router.refresh())
        .catch(() => router.refresh())
        .finally(() => setBusyId(null))
    },
    [router]
  )

  const handleSetStatus = useCallback(
    (goalId: string, status: string) => {
      // Archiving hides the goal; other statuses just update in place.
      setLocalGoals((prev) =>
        status === "archived"
          ? prev.filter((g) => g.id !== goalId)
          : prev.map((g) => (g.id === goalId ? { ...g, status } : g))
      )
      setBusyId(goalId)
      setGoalStatus(goalId, status)
        .then(() => router.refresh())
        .catch(() => router.refresh())
        .finally(() => setBusyId(null))
    },
    [router]
  )

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this goal?")) return
      setLocalGoals((prev) => prev.filter((g) => g.id !== id))
      deleteGoal(id)
        .then(() => router.refresh())
        .catch(() => router.refresh())
    },
    [router]
  )

  const active = localGoals.filter((g) => g.status !== "achieved")
  const achieved = localGoals.filter((g) => g.status === "achieved")

  const renderCard = (g: Goal) => (
    <GoalCard
      key={g.id}
      goal={g}
      busy={busyId === g.id}
      onAdjust={(delta) => handleAdjust(g.id, delta)}
      onSetStatus={(status) => handleSetStatus(g.id, status)}
      onEdit={() => {
        setEditing(g)
        setShowForm(true)
      }}
      onDelete={() => handleDelete(g.id)}
    />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Goals</h1>
          <p className="text-gray-600 mt-1">Set an outcome, track progress toward it</p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
        >
          + New Goal
        </button>
      </div>

      {localGoals.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No goals yet. Set one to aim at.</div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && <div className="space-y-2">{active.map(renderCard)}</div>}
          {achieved.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Achieved</h2>
              {achieved.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{editing ? "Edit Goal" : "New Goal"}</h2>
            <GoalForm
              goal={editing ?? undefined}
              onClose={() => setShowForm(false)}
              onSaved={() => router.refresh()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
