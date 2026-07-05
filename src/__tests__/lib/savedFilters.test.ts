/**
 * Unit tests for src/lib/savedFilters.ts (canonicalizeQuery + whitelist).
 */

import { canonicalizeQuery, SAVED_FILTER_KEYS } from "@/lib/savedFilters"

describe("canonicalizeQuery", () => {
  it("returns empty string for empty / nullish input", () => {
    expect(canonicalizeQuery("")).toBe("")
    expect(canonicalizeQuery(null)).toBe("")
    expect(canonicalizeQuery(undefined)).toBe("")
  })

  it("keeps only whitelisted keys and drops arbitrary ones", () => {
    const out = canonicalizeQuery("horizon=thisMonth&evil=1&priority=high&__proto__=x")
    expect(out).toBe("horizon=thisMonth&priority=high")
  })

  it("serializes keys in the canonical order regardless of input order", () => {
    expect(canonicalizeQuery("priority=high&horizon=today")).toBe(
      "horizon=today&priority=high"
    )
    // tags is last in the canonical order
    expect(canonicalizeQuery("tags=a,b&q=hi")).toBe("q=hi&tags=a%2Cb")
  })

  it("drops keys with empty values", () => {
    expect(canonicalizeQuery("horizon=&q=hi")).toBe("q=hi")
  })

  it("tolerates a leading '?'", () => {
    expect(canonicalizeQuery("?horizon=today")).toBe("horizon=today")
  })

  it("keeps only the first value of a repeated key", () => {
    expect(canonicalizeQuery("status=todo&status=done")).toBe("status=todo")
  })

  it("is idempotent", () => {
    const raw = "sort=priority&horizon=today&junk=9&priority=high"
    const once = canonicalizeQuery(raw)
    expect(canonicalizeQuery(once)).toBe(once)
  })

  it("covers every documented filter key", () => {
    const raw = SAVED_FILTER_KEYS.map((k) => `${k}=x`).join("&")
    const out = canonicalizeQuery(raw)
    for (const k of SAVED_FILTER_KEYS) expect(out).toContain(`${k}=x`)
  })
})
