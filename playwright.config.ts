import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests.
 *
 * These are DELIBERATELY separate from the Jest suite and are not part of
 * `npm test`. They need a real Postgres database and a built app, which the unit
 * suite does not — but they are the only way to prove behaviour that lives in the
 * interaction itself. The drag-ordering fix is the case in point: its bug only
 * appears after several real drops into the same slot, and no amount of unit
 * testing of the reducer would have caught the collision.
 *
 * They run against a DEDICATED database (E2E_DATABASE_URL) which the seed wipes
 * on every run. Never point this at a database you care about.
 *
 *   createdb -O focusflow focusflow_e2e     # once
 *   npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://focusflow:focusflow@localhost:5432/focusflow_e2e"

export default defineConfig({
  testDir: "./e2e",
  // Ordering is global per column, so parallel specs would fight over the same rows.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, not `next dev`: dev mode needs file watchers, and this
    // machine (and plenty of CI runners) hit the inotify limit.
    command: "npx next build && npx next start -p " + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATABASE_URL,
      NEXTAUTH_URL: BASE_URL,
      AUTH_URL: BASE_URL,
      NEXTAUTH_SECRET: "e2e-secret-not-for-production",
      AUTH_SECRET: "e2e-secret-not-for-production",
      // Without this NextAuth's middleware treats an anonymous caller as signed
      // in on a non-default host, and /auth/signin <-> /dashboard loops forever.
      AUTH_TRUST_HOST: "true",
    },
  },
})
