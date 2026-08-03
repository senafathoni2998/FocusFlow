/**
 * Everything the chat assistant needs to read or change, as one interface.
 *
 * The assistant is the most intricate surface in this codebase — a 900-line tool
 * dispatch with fifteen cases. Duplicating it for the mobile API was the obvious
 * move and the wrong one: this project has already been bitten four times by the
 * Server Actions and the service layer drifting apart (an unauthenticated IDOR, a
 * missing ownership check, a reminder cap applied to only one of the two paths, a
 * tag bug fixed on one side). A second copy of the hardest code would be the
 * fifth, and the assistant is precisely where a divergence is hardest to notice,
 * because a model produces different output every time.
 *
 * So the logic exists once and the DATA ACCESS is injected. The web builds a port
 * from its session-scoped Server Actions; the mobile API builds one from its
 * userId-scoped services.
 *
 * The contract is the Server Actions' shape — `{ error }` on failure rather than
 * a throw — because that is what the existing, tested dispatch already expects.
 * Adapting is therefore confined to the mobile adapter, where a thrown ApiError
 * becomes `{ error }`, instead of being spread through fifteen call sites.
 */

/** Loose on purpose: each implementation returns its own richer row type. */
type Result = Record<string, unknown> & { error?: string }

/**
 * A row as the assistant sees it.
 *
 * Deliberately loose, and this is the one real cost of the port. The two layers
 * genuinely return different shapes for the same entity — the Server Actions hand
 * back Prisma rows with `Date` fields, while the services return dates serialised
 * to `yyyy-MM-dd` for the mobile client — so no single precise type is correct
 * for both. Pinning one would be a lie about the other.
 *
 * The core only ever reads these rows to build prompt text, and casts to the real
 * domain type (`as Goal`, `as Habit`) wherever it does actual work, so the
 * looseness stops at the boundary rather than spreading.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatRow = Record<string, any>

export interface ChatPort {
  // ---- Tasks ----
  getTasks(): Promise<ChatRow[]>
  createTask(data: Record<string, unknown>): Promise<Result>
  updateTask(id: string, data: Record<string, unknown>): Promise<Result>
  completeTask(id: string): Promise<Result>
  deleteTask(id: string): Promise<Result>

  // ---- Goals ----
  getGoals(): Promise<ChatRow[]>
  createGoal(data: Record<string, unknown>): Promise<Result>
  updateGoal(id: string, data: Record<string, unknown>): Promise<Result>
  adjustGoalProgress(id: string, delta: number): Promise<Result>
  setGoalStatus(id: string, status: string): Promise<Result>
  deleteGoal(id: string): Promise<Result>

  // ---- Habits ----
  getHabits(): Promise<ChatRow[]>
  createHabit(data: Record<string, unknown>): Promise<Result>
  checkInHabit(data: Record<string, unknown>): Promise<Result>
  deleteHabit(id: string): Promise<Result>

  // ---- Reminders / settings ----
  getDueReminders(): Promise<ChatRow[]>
  getUserAIProviderPref(): Promise<string | null>
}
