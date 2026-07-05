/**
 * Shared saved-filter helpers (pure, no server deps) so the server action and the
 * client workspace produce byte-identical canonical query strings — that lets us
 * both store a clean query and reliably highlight the currently-active saved view.
 */

/**
 * The only URL params a saved view may carry. Anything else in the URL (or in a
 * tampered payload) is dropped, so a saved filter can never smuggle arbitrary
 * query params. Order here is the canonical serialization order.
 */
export const SAVED_FILTER_KEYS = [
  "horizon",
  "status",
  "priority",
  "q",
  "sort",
  "from",
  "to",
  "view",
  "list",
  "tags",
] as const

/**
 * Reduce a raw query string to a canonical form: only whitelisted keys, first
 * value each, empty values dropped, keys in a fixed order. Idempotent, so
 * canonicalize(canonicalize(x)) === canonicalize(x).
 */
export function canonicalizeQuery(raw: string | null | undefined): string {
  if (!raw) return ""
  let params: URLSearchParams
  try {
    params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw)
  } catch {
    return ""
  }
  const out = new URLSearchParams()
  for (const key of SAVED_FILTER_KEYS) {
    const v = params.get(key)
    if (v != null && v !== "") out.set(key, v)
  }
  return out.toString()
}
