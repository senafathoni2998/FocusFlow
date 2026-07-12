import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import WeeklyReview from "@/components/dashboard/WeeklyReview"

const payload = {
  weekStart: "2026-07-06T00:00:00.000Z",
  weekEnd: "2026-07-12T23:59:59.999Z",
  stats: { tasksCompleted: 3, focusMinutes: 75, habitCheckins: 4 },
  recap: ["Completed 3 tasks including login."],
  plan: ["Prioritize the API design."],
}

const mockFetch = (data: any, ok = true) => {
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok, json: async () => data })
}

describe("WeeklyReview card", () => {
  beforeEach(() => jest.clearAllMocks())

  it("shows a prompt and a Generate button before running", () => {
    render(<WeeklyReview />)
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument()
    expect(screen.getByText(/recap of what you got done/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled() // on-demand, not auto-loaded
  })

  it("fetches and renders stats, recap and plan", async () => {
    mockFetch(payload)
    render(<WeeklyReview />)

    await userEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/ai/weekly-review"),
    )
    expect(await screen.findByText(/3 completed/)).toBeInTheDocument()
    expect(screen.getByText(/1h 15m focus/)).toBeInTheDocument()
    expect(screen.getByText(/4 check-ins/)).toBeInTheDocument()
    expect(screen.getByText("Completed 3 tasks including login.")).toBeInTheDocument()
    expect(screen.getByText("Prioritize the API design.")).toBeInTheDocument()
    // Button flips to Regenerate once a review exists.
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument()
  })

  it("surfaces a soft error but still shows fallback content", async () => {
    mockFetch({ ...payload, error: "AI provider not configured" })
    render(<WeeklyReview />)
    await userEvent.click(screen.getByRole("button", { name: "Generate" }))
    expect(await screen.findByText("AI provider not configured")).toBeInTheDocument()
    expect(screen.getByText(/3 completed/)).toBeInTheDocument()
  })

  it("shows an error when the request fails", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<WeeklyReview />)
    await userEvent.click(screen.getByRole("button", { name: "Generate" }))
    expect(await screen.findByText(/couldn't generate the review/i)).toBeInTheDocument()
  })

  it("Regenerate re-fetches and replaces the content", async () => {
    mockFetch(payload)
    render(<WeeklyReview />)
    await userEvent.click(screen.getByRole("button", { name: "Generate" }))
    expect(await screen.findByText(/3 completed/)).toBeInTheDocument()

    // Second run returns a different review.
    mockFetch({
      ...payload,
      stats: { tasksCompleted: 9, focusMinutes: 0, habitCheckins: 0 },
      recap: ["A bigger week."],
      plan: ["Keep the streak."],
    })
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }))

    expect(await screen.findByText(/9 completed/)).toBeInTheDocument()
    expect(screen.getByText("A bigger week.")).toBeInTheDocument()
    expect(screen.queryByText(/3 completed/)).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
