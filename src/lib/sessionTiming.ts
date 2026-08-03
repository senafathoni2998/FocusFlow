/**
 * Focus minutes are derived everywhere as `endTime - startTime` (task `actualMin`,
 * the dashboard's focus tiles, the charts, the AI weekly review) — the `duration`
 * column is the PLANNED length, not the measured one.
 *
 * The client countdown is tick-based (`setInterval` decrementing once a second), so
 * it does not advance while the tab is throttled or the machine is suspended. A
 * pomodoro started at 17:00 on a laptop that sleeps at 17:05 completes whenever the
 * lid reopens, and stamping the wall clock at that moment records a single session
 * lasting hours. That figure is persisted and never self-corrects.
 *
 * Capping the stamp at the planned duration bounds the damage to something that can
 * never exceed what the user actually asked the timer to run for.
 */
export function cappedEndTime(
  startTime: Date | string,
  durationSeconds: number,
  now: Date = new Date(),
): Date {
  const start = new Date(startTime).getTime()
  if (!Number.isFinite(start)) return now
  // Guard against a missing/absurd duration rather than trusting the column blindly.
  const planned =
    Number.isInteger(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
  if (planned === 0) return now
  return new Date(Math.min(now.getTime(), start + planned * 1000))
}
