/**
 * Whether this server accepts new accounts.
 *
 * A self-hosted FocusFlow is usually one person's, and a PUBLIC one — the
 * instance Google's reviewers sign in to, say — has no business letting
 * strangers register. `ALLOW_SIGNUP=false` closes both doors (the web signup
 * form and `POST /api/v1/auth/register`) with the same 403, and nothing else
 * changes: existing accounts sign in as before.
 *
 * Unset means OPEN, because that is what every existing deployment had.
 */
export function isSignupOpen(): boolean {
  const raw = process.env.ALLOW_SIGNUP
  if (raw === undefined || raw.trim() === "") return true
  return !/^(false|0|no|off)$/i.test(raw.trim())
}

export const SIGNUP_CLOSED_MESSAGE =
  "This server is not accepting new accounts. Ask its administrator for one."
