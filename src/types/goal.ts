/** Client-facing goal shape (mirrors the Prisma Goal model). */
export interface Goal {
  id: string
  title: string
  description?: string | null
  icon: string
  color: string
  progressType: string // manual | numeric | tasks
  targetValue?: number | null
  currentValue: number
  unit?: string | null
  manualProgress: number
  targetDate?: Date | string | null
  status: string // active | achieved | archived
  order?: number
  createdAt?: Date | string
  // Derived counts for a "tasks"-progress goal (computed in getGoals from linked
  // tasks; wont-do tasks are excluded from the total).
  taskTotal?: number
  taskCompleted?: number
}

/** Minimal goal shape for the task-form assignment dropdown. */
export interface GoalOption {
  id: string
  title: string
  icon: string
}

/** A goal's linked task, as shown in the detail panel. */
export interface GoalTask {
  id: string
  title: string
  status: string
  dueDate?: Date | string | null
}

export const GOAL_COLORS = ["primary", "success", "warning", "danger"] as const
export type GoalColor = (typeof GOAL_COLORS)[number]

export const GOAL_STATUSES = ["active", "achieved", "archived"] as const
