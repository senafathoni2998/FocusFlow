import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * The Settings card for background push. Mostly about the toggle telling the
 * truth: "on" has to mean a push can actually arrive here, and there is one
 * state — local subscription present, server row gone — where the naive
 * reading says "on" and nothing can ever be delivered.
 */

const mockGetKey = jest.fn()
const mockGetSubs = jest.fn()
const mockSave = jest.fn()
const mockRemove = jest.fn()
const mockTest = jest.fn()
jest.mock("@/app/actions/push", () => ({
  getPushPublicKey: () => mockGetKey(),
  getPushSubscriptions: () => mockGetSubs(),
  savePushSubscription: (s: unknown) => mockSave(s),
  removePushSubscription: (e: string) => mockRemove(e),
  sendTestPushNotification: () => mockTest(),
}))

const mockCurrent = jest.fn()
const mockSubscribe = jest.fn()
const mockUnsubscribe = jest.fn()
jest.mock("@/lib/pushClient", () => ({
  checkPushSupport: () => ({ supported: true }),
  currentEndpoint: () => mockCurrent(),
  subscribeToPush: (k: string) => mockSubscribe(k),
  unsubscribeFromPush: () => mockUnsubscribe(),
}))

import PushNotificationsCard from "@/components/settings/PushNotificationsCard"

const HERE = "https://push.example/this-browser"
const row = (endpoint: string) => ({
  id: endpoint,
  endpoint,
  label: "Chrome on Linux",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  lastSuccessAt: null,
})

beforeEach(() => {
  jest.resetAllMocks()
  mockGetKey.mockResolvedValue("PUBLIC-KEY")
  mockGetSubs.mockResolvedValue([])
  mockCurrent.mockResolvedValue(null)
  mockSave.mockResolvedValue({ success: true, id: "s1" })
  mockRemove.mockResolvedValue({ success: true, count: 1 })
  mockUnsubscribe.mockResolvedValue(HERE)
})

describe("what the toggle says", () => {
  it("renders nothing at all when the server has no VAPID keys", async () => {
    mockGetKey.mockResolvedValue(null)
    const { container } = render(<PushNotificationsCard />)
    await waitFor(() => expect(mockGetKey).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("reads ON when this browser is subscribed AND the server has its row", async () => {
    mockCurrent.mockResolvedValue(HERE)
    mockGetSubs.mockResolvedValue([row(HERE)])
    render(<PushNotificationsCard />)
    expect(await screen.findByRole("button", { name: /turn off on this browser/i })).toBeInTheDocument()
    expect(screen.getByText("this browser")).toBeInTheDocument()
  })

  it("reads OFF when this browser is subscribed but the server row is GONE", async () => {
    // Removing this browser from another machine deletes the row but cannot
    // reach the PushManager here, so the local subscription lingers. Reading it
    // as "on" would promise reminders that can never arrive.
    mockCurrent.mockResolvedValue(HERE)
    mockGetSubs.mockResolvedValue([row("https://push.example/some-other-machine")])
    render(<PushNotificationsCard />)
    expect(await screen.findByRole("button", { name: /turn on for this browser/i })).toBeInTheDocument()
    expect(screen.queryByText("this browser")).not.toBeInTheDocument()
  })

  it("turning on re-saves the same subscription, so a remotely-removed browser comes back", async () => {
    mockCurrent.mockResolvedValue(HERE)
    mockSubscribe.mockResolvedValue({ endpoint: HERE, keys: { p256dh: "p", auth: "a" } })
    mockGetSubs.mockResolvedValueOnce([]).mockResolvedValueOnce([row(HERE)])
    render(<PushNotificationsCard />)

    await userEvent.click(await screen.findByRole("button", { name: /turn on for this browser/i }))

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ endpoint: HERE, keys: { p256dh: "p", auth: "a" } }))
    expect(await screen.findByRole("button", { name: /turn off on this browser/i })).toBeInTheDocument()
  })

  it("undoes the browser subscription when the server refuses to save it", async () => {
    // Otherwise the browser is subscribed, the server does not know, and the
    // switch would read "on" while nothing can be delivered.
    mockSubscribe.mockResolvedValue({ endpoint: HERE, keys: { p256dh: "p", auth: "a" } })
    mockSave.mockResolvedValue({ error: "nope" })
    render(<PushNotificationsCard />)

    await userEvent.click(await screen.findByRole("button", { name: /turn on for this browser/i }))

    await waitFor(() => expect(mockUnsubscribe).toHaveBeenCalled())
    expect(await screen.findByRole("alert")).toHaveTextContent("nope")
  })
})

describe("the test button", () => {
  it("shows BOTH halves of a partial result", async () => {
    // "Sent to 1, and the other failed because…" is the exact answer someone
    // with two browsers is asking for; hiding the success behind the failure
    // would send them looking for a problem on the browser that worked.
    mockCurrent.mockResolvedValue(HERE)
    mockGetSubs.mockResolvedValue([row(HERE), row("https://push.example/laptop")])
    mockTest.mockResolvedValue({ sent: 1, pruned: 0, failures: ["Firefox on Linux: boom"] })
    render(<PushNotificationsCard />)

    await userEvent.click(await screen.findByRole("button", { name: /send a test notification/i }))

    expect(await screen.findByText(/sent to 1 browser/i)).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Firefox on Linux: boom")
  })

  it("re-reads the list when the send pruned a dead browser", async () => {
    mockCurrent.mockResolvedValue(HERE)
    mockGetSubs
      .mockResolvedValueOnce([row(HERE), row("https://push.example/dead")])
      .mockResolvedValueOnce([row(HERE)])
    mockTest.mockResolvedValue({ sent: 1, pruned: 1, failures: [] })
    render(<PushNotificationsCard />)

    await userEvent.click(await screen.findByRole("button", { name: /send a test notification/i }))

    await waitFor(() => expect(mockGetSubs).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(1)
  })
})
