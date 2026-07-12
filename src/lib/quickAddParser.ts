import { addDays, addWeeks, nextDay, startOfDay, type Day } from "date-fns"

/**
 * Deterministic quick-add parser. Extracts TickTick-style tokens from a natural
 * language line — `#tag`, `!priority`, and common date words — instantly, with no
 * AI call. Whatever it can't resolve about a DATE is left for the AI fallback
 * (`hasDateHint` tells the caller when it's worth asking the model).
 *
 *   "Pay rent tomorrow #home !high"
 *     -> { title: "Pay rent", dueDate: <tomorrow>, tags: ["home"], priority: "high", matchedDate: true }
 *
 * Bias: only resolve a token deterministically when it is UNAMBIGUOUS. Ambiguous
 * forms (bare 3-letter weekdays, year-less M/D, "next friday") are deliberately
 * left unmatched so they can't silently rewrite a title — the AI fallback handles
 * the genuine dates among them.
 */

export type ParsedPriority = "none" | "low" | "medium" | "high"

export interface ParsedQuickAdd {
  title: string
  tags: string[]
  priority?: ParsedPriority
  /** Local YYYY-MM-DD, only when a date token was recognized. */
  dueDate?: string
  /** True when a date token was recognized deterministically. */
  matchedDate: boolean
}

const WEEKDAYS: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const PRIORITY_WORDS: Record<string, ParsedPriority> = {
  high: "high", urgent: "high",
  medium: "medium", med: "medium",
  low: "low",
  none: "none",
}

// Largest "in N days/weeks" offset we resolve deterministically — beyond this we
// leave it (a fat-fingered huge N would otherwise overflow to an Invalid Date).
const MAX_IN_DAYS = 3650

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

// A real calendar day (rejects 2026-02-30 etc.).
function validYmdParts(y: number, m: number, d: number): Date | null {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
    ? dt
    : null
}

function upcomingWeekday(from: Date, day: Day): Date {
  const base = startOfDay(from)
  // Today counts if it already is that weekday; otherwise the next occurrence.
  return base.getDay() === day ? base : nextDay(base, day)
}

/**
 * Resolve a single UNAMBIGUOUS date token in `text`. Returns the ISO date and the
 * matched substring (so the caller can strip it), or null. `text` is assumed to
 * have single-spaced whitespace. Patterns are tried most-specific first.
 */
function extractDate(text: string, now: Date): { iso: string; match: string } | null {
  const today = startOfDay(now)

  // ISO YYYY-MM-DD
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)
  if (m) {
    const dt = validYmdParts(Number(m[1]), Number(m[2]), Number(m[3]))
    if (dt) return { iso: ymd(dt), match: m[0] }
  }

  // M/D/YY(YY) — an explicit YEAR is required. Year-less "1/2" is ambiguous with
  // fractions/scores ("1/2 gallon", "score 3/4") so we never treat it as a date.
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(text)
  if (m) {
    let year = Number(m[3])
    if (year < 100) year += 2000
    const dt = validYmdParts(year, Number(m[1]), Number(m[2]))
    if (dt) return { iso: ymd(dt), match: m[0] }
  }

  // in N days / in N weeks (bounded)
  m = /\bin\s+(\d+)\s+(days?|weeks?)\b/i.exec(text)
  if (m) {
    const n = Number(m[1])
    if (n <= MAX_IN_DAYS) {
      const dt = /^week/i.test(m[2]) ? addWeeks(today, n) : addDays(today, n)
      return { iso: ymd(dt), match: m[0] }
    }
  }

  // today / tonight
  m = /\b(today|tonight)\b/i.exec(text)
  if (m) return { iso: ymd(today), match: m[0] }

  // tomorrow
  m = /\b(tomorrow|tmr|tmrw)\b/i.exec(text)
  if (m) return { iso: ymd(addDays(today, 1)), match: m[0] }

  // next week
  m = /\bnext\s+week\b/i.exec(text)
  if (m) return { iso: ymd(addDays(today, 7)), match: m[0] }

  // (this) weekend -> the upcoming Saturday
  m = /\b(?:this\s+)?weekend\b/i.exec(text)
  if (m) return { iso: ymd(upcomingWeekday(today, 6)), match: m[0] }

  // A bare FULL-name weekday (not "next <weekday>" — that's ambiguous, defer to AI).
  // 3-letter forms (sun/sat/mon…) are intentionally excluded: they collide with
  // ordinary words ("sun cream", "SAT scores") and would silently rewrite titles.
  m = /(?<!next\s)\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text)
  if (m) {
    const day = WEEKDAYS[m[1].toLowerCase()]
    if (day !== undefined) return { iso: ymd(upcomingWeekday(today, day)), match: m[0] }
  }

  return null
}

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  let text = ` ${input} `

  // 1) Tags: #word (unicode letters/digits/_/-). Collected, deduped, stripped whole
  //    so no fragment (e.g. an accent) leaks into the title.
  const tags: string[] = []
  text = text.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_, tag: string) => {
    const t = tag.trim()
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t)
    return " "
  })

  // 2) Priority: word form (!high) and exclamation shorthand (!!! / !! / !), scanned
  //    positionally so the LAST one the user typed wins regardless of form.
  let priority: ParsedPriority | undefined
  const priScan = /(?:^|\s)(?:!(high|urgent|medium|med|low|none)\b|(!{1,3})(?=\s))/gi
  let pm: RegExpExecArray | null
  while ((pm = priScan.exec(text)) !== null) {
    if (pm[1]) priority = PRIORITY_WORDS[pm[1].toLowerCase()]
    else if (pm[2]) priority = pm[2].length === 3 ? "high" : pm[2].length === 2 ? "medium" : "low"
  }
  text = text
    .replace(/(?:^|\s)!(?:high|urgent|medium|med|low|none)\b/gi, " ")
    .replace(/(?:^|\s)!{1,3}(?=\s)/g, " ")

  // Collapse whitespace before date extraction so fixed-width lookbehind
  // ("next <weekday>") and word boundaries behave even after token removal.
  text = text.replace(/\s+/g, " ")

  // 3) Date: at most one deterministic token, stripped from the title.
  let dueDate: string | undefined
  const dateHit = extractDate(text, now)
  if (dateHit) {
    dueDate = dateHit.iso
    text = text.replace(dateHit.match, " ")
  }

  const title = text.replace(/\s+/g, " ").trim()

  return { title, tags, priority, dueDate, matchedDate: !!dateHit }
}

// Temporal phrases the deterministic parser does NOT resolve, ANCHORED so ordinary
// words don't false-trigger ("Email May about the budget", "Plan next sprint",
// "score 3/4" must all be false). Only consulted when parseQuickAdd found no date,
// to decide whether asking the AI is worthwhile.
const MONTHS =
  "jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?"
const WEEKDAY_FULL = "monday|tuesday|wednesday|thursday|friday|saturday|sunday"

const DATE_HINT_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, "i"), // "aug 1"
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\b`, "i"), // "1 aug"
  /\b\d{1,2}(st|nd|rd|th)\b/i, // "the 15th"
  new RegExp(`\\b(?:this|next|last)\\s+(?:week|month|year|quarter|weekend|${WEEKDAY_FULL})\\b`, "i"),
  /\b(?:end|start|beginning)\s+of\s+(?:the\s+)?(?:week|month|quarter|year)\b/i,
  /\b(?:tomorrow|today|tonight|tmr|tmrw|payday)\b/i,
  /\bin\s+\d+\s+(?:days?|weeks?|months?|years?)\b/i,
]

export function hasDateHint(text: string): boolean {
  return DATE_HINT_PATTERNS.some((re) => re.test(text))
}
