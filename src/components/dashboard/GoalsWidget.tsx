import Link from "next/link"
import type { Goal } from "@/types/goal"
import { goalPercent } from "@/lib/goalStats"

const FILL: Record<string, string> = {
  primary: "bg-primary-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
}

/**
 * Compact dashboard widget: active goals with their progress bars. Progress is a
 * pure function of stored values (no clock), so this renders safely on the server.
 */
export default function GoalsWidget({ goals }: { goals: Goal[] }) {
  const active = goals.filter((g) => g.status === "active").slice(0, 5)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span aria-hidden="true">🎯</span> Goals
        </h3>
        <Link href="/goals" className="text-sm text-primary-600 hover:text-primary-800">
          View all →
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-gray-500">
          No active goals.{" "}
          <Link href="/goals" className="text-primary-600 hover:underline">
            Set one →
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((g) => {
            const pct = goalPercent(g)
            return (
              <li key={g.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 truncate flex items-center gap-1.5 min-w-0">
                    <span aria-hidden="true">{g.icon}</span>
                    <span className="truncate">{g.title}</span>
                  </span>
                  <span className="text-gray-400 tabular-nums ml-2">{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full ${FILL[g.color] ?? FILL.primary}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
