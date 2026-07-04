"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { Goal } from "@/types/goal"
import { adjustGoalProgress, setGoalStatus, deleteGoal, getArchivedGoals } from "@/app/actions/goals"
import { goalPercent } from "@/lib/goalStats"
import GoalCard from "./GoalCard"
import GoalForm from "./GoalForm"
import GoalDetail from "./GoalDetail"

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
  const [showArchived, setShowArchived] = useState(false)
  const [archivedGoals, setArchivedGoals] = useState<Goal[]>([])
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null)

  useEffect(() => setLocalGoals(goals), [goals])

  // Keep an open detail panel's goal in sync with fresh server data so its header
  // progress updates live; if the goal has left the active list (archived/deleted
  // elsewhere), close the panel rather than showing a stale, orphaned goal.
  useEffect(() => {
    setDetailGoal((cur) => (cur ? localGoals.find((g) => g.id === cur.id) ?? null : cur))
  }, [localGoals])

  // Load the archived list when the section is open, and refresh it whenever the
  // active goals change (e.g. a goal was just archived and dropped from `goals`).
  // The `cancelled` guard drops a stale in-flight fetch so an out-of-order
  // resolution can't clobber a newer optimistic update.
  useEffect(() => {
    if (!showArchived) return
    let cancelled = false
    getArchivedGoals().then((g) => {
      if (!cancelled) setArchivedGoals(g as Goal[])
    })
    return () => {
      cancelled = true
    }
  }, [showArchived, goals])

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

  const handleRestore = useCallback(
    (id: string) => {
      setArchivedGoals((prev) => prev.filter((g) => g.id !== id))
      setGoalStatus(id, "active")
        .then(() => router.refresh())
        .catch(() => router.refresh())
    },
    [router]
  )

  const handleDeleteArchived = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this goal?")) return
      setArchivedGoals((prev) => prev.filter((g) => g.id !== id))
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
      onOpenDetail={() => setDetailGoal(g)}
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
        <div className="text-center py-16 text-gray-500">No active goals. Set one to aim at.</div>
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

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowArchived((s) => !s)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>

        {showArchived &&
          (archivedGoals.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">No archived goals.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {archivedGoals.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-200 p-3"
                >
                  <span className="text-xl" aria-hidden="true">
                    {g.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 truncate">{g.title}</div>
                    <div className="text-xs text-gray-400 tabular-nums">{goalPercent(g)}%</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(g.id)}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteArchived(g.id)}
                    className="text-sm text-danger-600 hover:text-danger-800"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ))}
      </div>

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

      {detailGoal && (
        <GoalDetail
          goal={detailGoal}
          onClose={() => setDetailGoal(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}
