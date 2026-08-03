import { test, expect } from "@playwright/test"
import { closeDb, readColumn, seed } from "./support/db"
import { dragBelow, signIn, titlesOnScreen } from "./support/board"

/**
 * Kanban drag ordering.
 *
 * `Task.order` is an Int seeded in steps of 10, and dropping between two cards
 * takes the midpoint. Repeated drops into the same slot halve the gap until there
 * is none — 10/20 -> 15 -> 13 -> 12 -> 11 — and the next midpoint rounds to the
 * successor's own order. The card then renders on the wrong side of it (the
 * server breaks ties by createdAt) and that slot becomes permanently
 * un-insertable.
 *
 * None of that is reachable from a unit test: it needs several real drops, and
 * the symptom is a persisted collision, not a render. So these assertions read
 * the `order` column back rather than trusting the board.
 */

test.afterAll(async () => {
  await closeDb()
})

test("respaces the column when the gap between neighbours is exhausted", async ({ page }) => {
  // ALPHA/BRAVO have NO integer between them: the end state of repeated inserts.
  await seed([
    { title: "ALPHA", order: 10 },
    { title: "BRAVO", order: 11 },
    { title: "CHARLIE", order: 30 },
  ])

  await signIn(page)
  await page.goto("/tasks")
  await expect(page.locator("h3", { hasText: "ALPHA" })).toBeVisible()

  await dragBelow(page, "CHARLIE", "ALPHA")

  // Landed where it was dropped...
  expect(await titlesOnScreen(page)).toEqual(["ALPHA", "CHARLIE", "BRAVO"])
  // ...and the whole column was respaced, so the slot is insertable again.
  // The old behaviour wrote CHARLIE = 11, colliding with BRAVO.
  expect(await readColumn()).toEqual([
    ["ALPHA", 0],
    ["CHARLIE", 10],
    ["BRAVO", 20],
  ])
})

test("survives repeated drops into the same slot without ever colliding", async ({ page }) => {
  await seed([
    { title: "ALPHA", order: 10 },
    { title: "BRAVO", order: 20 },
    { title: "CHARLIE", order: 30 },
  ])

  await signIn(page)
  await page.goto("/tasks")
  await expect(page.locator("h3", { hasText: "ALPHA" })).toBeVisible()

  // Six drops of the last card into the second slot. Midpoints narrow the gap
  // until it is exhausted, at which point the column respaces and the cycle
  // repeats — the previous implementation dead-ended on the fifth.
  for (let round = 1; round <= 6; round++) {
    const before = await titlesOnScreen(page)
    await dragBelow(page, before[2], before[0])

    const onScreen = await titlesOnScreen(page)
    const persisted = await readColumn()

    // The order the user sees is the order that was saved.
    expect(persisted.map(([title]) => title), `round ${round}: screen vs database`).toEqual(onScreen)

    // No two cards ever share an order — that collision is the bug.
    const orders = persisted.map(([, order]) => order)
    expect(new Set(orders).size, `round ${round}: duplicate order in ${JSON.stringify(persisted)}`).toBe(orders.length)

    // And the dropped card really moved into the middle.
    expect(onScreen[1], `round ${round}: dropped card should sit second`).toBe(before[2])
  }
})
