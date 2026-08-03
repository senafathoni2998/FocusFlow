import { Pool } from "pg"
import { hashSync } from "bcryptjs"

/**
 * Direct database access for E2E setup and assertions.
 *
 * Asserting through the UI alone would not prove this fix: the board can render
 * the right order while the persisted `order` values collide, which is exactly
 * the failure mode being tested. The assertions read the column back.
 */

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://focusflow:focusflow@localhost:5432/focusflow_e2e"

export const E2E_EMAIL = "e2e@focusflow.test"
export const E2E_PASSWORD = "e2e-password-123"
const E2E_USER_ID = "e2e-user-1"

let pool: Pool | null = null
function db(): Pool {
  pool ??= new Pool({ connectionString: E2E_DATABASE_URL })
  return pool
}

export async function closeDb() {
  await pool?.end()
  pool = null
}

/** A todo column, top to bottom, as `[title, order]`. */
export async function readColumn(status = "todo"): Promise<[string, number][]> {
  const { rows } = await db().query(
    'SELECT title, "order" FROM "Task" WHERE status = $1 ORDER BY "order" ASC, "createdAt" DESC',
    [status],
  )
  return rows.map((r) => [r.title as string, r.order as number])
}

/**
 * Wipe and reseed. `orders` is applied verbatim so a test can start from a state
 * that would take many drags to reach naturally — notably an exhausted gap.
 */
export async function seed(tasks: { title: string; order: number }[]) {
  const c = db()
  await c.query('DELETE FROM "TaskTag"')
  await c.query('DELETE FROM "Task"')
  await c.query('DELETE FROM "User"')
  await c.query(
    `INSERT INTO "User" (id, email, name, password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'E2E', $3, now(), now())`,
    [E2E_USER_ID, E2E_EMAIL, hashSync(E2E_PASSWORD, 10)],
  )
  for (const [i, t] of tasks.entries()) {
    await c.query(
      `INSERT INTO "Task" (id, title, status, priority, "priorityRank", "isAllDay", "order", "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, 'todo', 'medium', 2, true, $3, $4, now() - ($5 || ' seconds')::interval, now())`,
      [`e2e-${t.title.toLowerCase()}`, t.title, t.order, E2E_USER_ID, String(tasks.length - i)],
    )
  }
}
