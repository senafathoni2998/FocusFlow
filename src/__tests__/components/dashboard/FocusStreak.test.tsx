import { render, screen, waitFor } from "@testing-library/react"
import FocusStreak from "@/components/dashboard/FocusStreak"

describe("FocusStreak", () => {
  beforeEach(() => jest.clearAllMocks())

  it("computes the streak from non-empty starts without fetching (card)", async () => {
    render(<FocusStreak starts={[new Date().toISOString()]} />)
    expect(await screen.findByText(/1-day focus streak/i)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("fetches /api/analytics when no starts are provided (compact)", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        focusSessionStarts: [new Date().toISOString(), new Date().toISOString()],
      }),
    })
    render(<FocusStreak variant="compact" />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/analytics"))
    expect(await screen.findByText(/1-day focus streak/i)).toBeInTheDocument()
  })

  it("self-fetches when starts is an empty array (recovers from a failed SSR fetch)", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ focusSessionStarts: [new Date().toISOString()] }),
    })
    render(<FocusStreak starts={[]} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/analytics"))
    expect(await screen.findByText(/1-day focus streak/i)).toBeInTheDocument()
  })

  it("shows a zero streak (no crash) when the fetch fails", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<FocusStreak variant="compact" />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(await screen.findByText(/0-day focus streak/i)).toBeInTheDocument()
  })
})
