import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockGetDue = jest.fn()
const mockMark = jest.fn().mockResolvedValue({ success: true })
jest.mock("@/app/actions/reminders", () => ({
  getDueReminders: (...a: any) => mockGetDue(...a),
  markRemindersDispatched: (...a: any) => mockMark(...a),
}))

import ReminderDispatcher from "@/components/reminders/ReminderDispatcher"

const due = (id: string, title: string) => ({
  id,
  triggerAt: new Date().toISOString(),
  task: { id: `t-${id}`, title },
})

describe("ReminderDispatcher", () => {
  beforeEach(() => jest.clearAllMocks())

  it("shows a banner and marks reminders dispatched when some are due", async () => {
    mockGetDue.mockResolvedValue([due("r1", "Submit report")])

    render(<ReminderDispatcher />)

    expect(await screen.findByText("Submit report")).toBeInTheDocument()
    expect(screen.getByText("Reminder")).toBeInTheDocument()
    await waitFor(() => expect(mockMark).toHaveBeenCalledWith(["r1"]))
  })

  it("renders nothing (and marks nothing) when no reminders are due", async () => {
    mockGetDue.mockResolvedValue([])

    const { container } = render(<ReminderDispatcher />)

    await waitFor(() => expect(mockGetDue).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(mockMark).not.toHaveBeenCalled()
  })

  it("falls back to a generic title when the reminder has no task", async () => {
    mockGetDue.mockResolvedValue([{ id: "r9", triggerAt: new Date().toISOString(), task: null }])

    render(<ReminderDispatcher />)

    expect(await screen.findByText("Task")).toBeInTheDocument()
    await waitFor(() => expect(mockMark).toHaveBeenCalledWith(["r9"]))
  })

  it("dismisses a banner on click", async () => {
    mockGetDue.mockResolvedValue([due("r1", "Call dentist")])

    render(<ReminderDispatcher />)

    const dismiss = await screen.findByRole("button", { name: "Dismiss reminder" })
    await userEvent.click(dismiss)
    await waitFor(() => expect(screen.queryByText("Call dentist")).not.toBeInTheDocument())
  })

  it("marks a due reminder only once across polls (cross-poll dedupe)", async () => {
    jest.useFakeTimers()
    try {
      mockGetDue.mockResolvedValue([due("r1", "Once")]) // same reminder every poll
      render(<ReminderDispatcher />)
      await act(async () => { await jest.advanceTimersByTimeAsync(0) }) // flush the mount poll
      expect(mockMark).toHaveBeenCalledTimes(1)
      await act(async () => { await jest.advanceTimersByTimeAsync(60_000) }) // next interval
      expect(mockMark).toHaveBeenCalledTimes(1) // firedRef dedupes → not re-marked
    } finally {
      jest.useRealTimers()
    }
  })

  it("retries on the next poll after a failed mark (nothing shown on failure)", async () => {
    jest.useFakeTimers()
    try {
      mockGetDue.mockResolvedValue([due("r1", "Retry me")])
      mockMark.mockResolvedValueOnce({ error: "Failed to mark reminders" }) // first attempt fails
      render(<ReminderDispatcher />)
      await act(async () => { await jest.advanceTimersByTimeAsync(0) })
      expect(mockMark).toHaveBeenCalledTimes(1)
      // Nothing shown on the failed claim, and it's un-tracked for retry.
      expect(screen.queryByText("Retry me")).not.toBeInTheDocument()
      await act(async () => { await jest.advanceTimersByTimeAsync(60_000) })
      expect(mockMark).toHaveBeenCalledTimes(2) // retried
    } finally {
      jest.useRealTimers()
    }
  })

  it("shows a browser Notification when permission is granted", async () => {
    const NotificationCtor: any = jest.fn()
    NotificationCtor.permission = "granted"
    NotificationCtor.requestPermission = jest.fn().mockResolvedValue("granted")
    ;(global as any).Notification = NotificationCtor
    ;(window as any).Notification = NotificationCtor
    try {
      mockGetDue.mockResolvedValue([due("r1", "Ping")])
      render(<ReminderDispatcher />)
      await screen.findByText("Ping")
      await waitFor(() =>
        expect(NotificationCtor).toHaveBeenCalledWith("FocusFlow reminder", { body: "Ping" })
      )
      // Permission already granted → no prompt.
      expect(NotificationCtor.requestPermission).not.toHaveBeenCalled()
    } finally {
      delete (global as any).Notification
      delete (window as any).Notification
    }
  })

  it("requests notification permission when it is still default", async () => {
    const NotificationCtor: any = jest.fn()
    NotificationCtor.permission = "default"
    NotificationCtor.requestPermission = jest.fn().mockResolvedValue("default")
    ;(global as any).Notification = NotificationCtor
    ;(window as any).Notification = NotificationCtor
    try {
      mockGetDue.mockResolvedValue([])
      render(<ReminderDispatcher />)
      await waitFor(() => expect(NotificationCtor.requestPermission).toHaveBeenCalled())
    } finally {
      delete (global as any).Notification
      delete (window as any).Notification
    }
  })
})
