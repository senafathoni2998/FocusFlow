import { cappedEndTime } from "@/lib/sessionTiming"

const start = new Date("2026-08-02T17:00:00Z")
const POMODORO = 25 * 60

describe("cappedEndTime", () => {
  it("uses the real time when the session is completed before the planned end", () => {
    // The mobile API can complete a session early (POST /sessions/:id/complete);
    // that genuinely shorter span must be preserved, not padded out to 25 minutes.
    const now = new Date("2026-08-02T17:20:00Z")
    expect(cappedEndTime(start, POMODORO, now)).toEqual(now)
  })

  it("caps a completion that lands even seconds past the planned end", () => {
    // The web timer always fires at/after the deadline, so it settles on exactly
    // the planned duration rather than drifting by the tick's overshoot.
    expect(cappedEndTime(start, POMODORO, new Date("2026-08-02T17:25:03Z"))).toEqual(
      new Date("2026-08-02T17:25:00Z"),
    )
  })

  it("caps a late completion at the planned duration", () => {
    // Laptop suspended at 17:05, reopened the next morning: the tick-based
    // countdown finishes then, and the raw wall clock would persist a single
    // 15-hour "pomodoro" into every focus metric.
    const now = new Date("2026-08-03T08:20:00Z")
    expect(cappedEndTime(start, POMODORO, now)).toEqual(new Date("2026-08-02T17:25:00Z"))
  })

  it("caps a throttled background tab too", () => {
    const now = new Date("2026-08-02T19:00:00Z")
    expect(cappedEndTime(start, POMODORO, now)).toEqual(new Date("2026-08-02T17:25:00Z"))
  })

  it("accepts an ISO string start", () => {
    const now = new Date("2026-08-03T08:20:00Z")
    expect(cappedEndTime(start.toISOString(), POMODORO, now)).toEqual(
      new Date("2026-08-02T17:25:00Z"),
    )
  })

  it("falls back to now when the duration is missing or nonsensical", () => {
    const now = new Date("2026-08-02T17:10:00Z")
    expect(cappedEndTime(start, 0, now)).toEqual(now)
    expect(cappedEndTime(start, -1, now)).toEqual(now)
    expect(cappedEndTime(start, 12.5, now)).toEqual(now)
  })

  it("falls back to now when the start time is unusable", () => {
    const now = new Date("2026-08-02T17:10:00Z")
    expect(cappedEndTime("not-a-date", POMODORO, now)).toEqual(now)
  })
})
