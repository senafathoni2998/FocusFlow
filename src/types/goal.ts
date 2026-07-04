/** Client-facing goal shape (mirrors the Prisma Goal model). */
export interface Goal {
  id: string
  title: string
  description?: string | null
  icon: string
  color: string
  progressType: string // manual | numeric
  targetValue?: number | null
  currentValue: number
  unit?: string | null
  manualProgress: number
  targetDate?: Date | string | null
  status: string // active | achieved | archived
  order?: number
  createdAt?: Date | string
}

export const GOAL_COLORS = ["primary", "success", "warning", "danger"] as const
export type GoalColor = (typeof GOAL_COLORS)[number]

export const GOAL_STATUSES = ["active", "achieved", "archived"] as const
