import type { Page } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD } from "./db"

export async function signIn(page: Page) {
  await page.goto("/auth/signin")
  await page.locator("input[type=email], input[name=email]").fill(E2E_EMAIL)
  await page.locator("input[type=password]").fill(E2E_PASSWORD)
  await page.locator("button[type=submit]").click()
  await page.waitForURL("**/dashboard")
}

/** Card titles in the todo column, top to bottom. */
export async function titlesOnScreen(page: Page): Promise<string[]> {
  return page.locator("h3").allTextContents().then((t) => t.map((s) => s.trim()))
}

/**
 * Drag `sourceTitle` onto the lower half of `targetTitle`, i.e. into the slot
 * directly BELOW the target.
 *
 * Playwright's `dragTo` is not enough here: it emits a single move, and dnd-kit's
 * PointerSensor needs an initial move past its 8px activation distance plus a
 * stream of further moves before its collision detection resolves onto a card.
 * With one move the drop lands on the column droppable instead and the card is
 * appended to the end — which silently tests nothing.
 */
export async function dragBelow(page: Page, sourceTitle: string, targetTitle: string) {
  await page.evaluate(
    async ([src, dst]) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const cardOf = (title: string) =>
        [...document.querySelectorAll("h3")]
          .find((h) => h.textContent?.trim() === title)
          ?.closest("div.bg-white")?.parentElement as HTMLElement | undefined

      const from = cardOf(src)
      const to = cardOf(dst)
      if (!from || !to) throw new Error(`card not found: ${src} -> ${dst}`)

      const fr = from.getBoundingClientRect()
      const tr = to.getBoundingClientRect()
      const start = { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 }
      // 0.75 of the way down the target puts the pointer past its centre, which is
      // how the board decides "after this card" rather than "before" it.
      const end = { x: tr.x + tr.width / 2, y: tr.y + tr.height * 0.75 }

      const send = (type: string, x: number, y: number) => {
        const ev = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        })
        ;(type === "pointerdown" ? from : document).dispatchEvent(ev)
      }

      send("pointerdown", start.x, start.y)
      await wait(30)
      const STEPS = 20
      for (let i = 1; i <= STEPS; i++) {
        send("pointermove", start.x + ((end.x - start.x) * i) / STEPS, start.y + ((end.y - start.y) * i) / STEPS)
        await wait(15)
      }
      await wait(120)
      send("pointerup", end.x, end.y)
    },
    [sourceTitle, targetTitle],
  )
  // The action persists and then router.refresh() re-renders.
  await page.waitForTimeout(900)
}
