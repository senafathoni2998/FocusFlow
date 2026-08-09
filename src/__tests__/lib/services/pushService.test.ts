/**
 * @jest-environment node
 *
 * pushService: background reminder delivery.
 *
 * Almost every test here is about ONE rule — nothing is claimed unless a push
 * was actually accepted for it. `dispatchedAt` is one-way and shared with the
 * in-app dispatcher and the Android poller, so claiming something that was never
 * delivered does not degrade the feature, it deletes the reminder.
 */
import { dispatchDuePushes } from "@/lib/services/pushService"

jest.mock("@/lib/webPush", () => ({
  isPushConfigured: jest.fn(() => true),
  sendPush: jest.fn(),
}))

import { isPushConfigured, sendPush } from "@/lib/webPush"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient
const mockSend = sendPush as jest.MockedFunction<typeof sendPush>
const mockConfigured = isPushConfigured as jest.MockedFunction<typeof isPushConfigured>

const NOW = new Date("2026-08-09T12:00:00.000Z")

const SUB = {
  id: "s1",
  userId: "u1",
  endpoint: "https://push.example/aaa",
  p256dh: "k",
  auth: "a",
}
const REMINDER = {
  id: "r1",
  taskId: "t1",
  triggerAt: new Date("2026-08-09T11:59:00.000Z"),
  task: { id: "t1", title: "Ship it" },
}

beforeEach(() => {
  jest.resetAllMocks()
  mockConfigured.mockReturnValue(true)
  mockSend.mockResolvedValue({ status: "sent" })
  prisma.pushSubscription = {
    findMany: jest.fn().mockResolvedValue([SUB]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  }
  prisma.reminder = {
    findMany: jest.fn().mockResolvedValue([REMINDER]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
})

describe("dispatchDuePushes — what gets claimed", () => {
  it("claims a reminder only after a push was accepted for it", async () => {
    const summary = await dispatchDuePushes(NOW)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(summary.delivered).toBe(1)

    const { where, data } = prisma.reminder.updateMany.mock.calls[0][0]
    expect(where.id.in).toEqual(["r1"])
    // Re-checked in the write itself, so a concurrent run or an open tab that
    // claimed it a moment ago makes this a no-op rather than a double count.
    expect(where.dispatchedAt).toBeNull()
    expect(data.dispatchedAt).toEqual(NOW)
  })

  it("claims NOTHING when the push service is failing", async () => {
    // The reminder has to stay undispatched, or an outage at the push provider
    // silently eats every reminder in it — the tab and the phone would never
    // see them either.
    mockSend.mockResolvedValue({ status: "failed", code: 503, message: "unavailable" })

    const summary = await dispatchDuePushes(NOW)

    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
    expect(summary.delivered).toBe(0)
    expect(summary.deferred).toBe(1)
  })

  it("claims nothing, and sends nothing, when nobody is subscribed", async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([])

    const summary = await dispatchDuePushes(NOW)

    expect(mockSend).not.toHaveBeenCalled()
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
    expect(summary).toEqual({ users: 0, delivered: 0, pruned: 0, deferred: 0 })
  })

  it("does nothing at all when the deployment has no VAPID keys", async () => {
    // A self-hosted install that never wanted push is a valid install, and the
    // cron line has to be harmless there.
    mockConfigured.mockReturnValue(false)

    const summary = await dispatchDuePushes(NOW)

    expect(summary.skipped).toBe(true)
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled()
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
  })

  it("still claims when one of two browsers is dead", async () => {
    // One accepted send is a delivery. Requiring every subscription to succeed
    // would let a single stale laptop re-notify the phone every minute forever.
    prisma.pushSubscription.findMany.mockResolvedValue([
      SUB,
      { ...SUB, id: "s2", endpoint: "https://push.example/dead" },
    ])
    mockSend
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "gone", code: 410 })
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 })

    const summary = await dispatchDuePushes(NOW)

    expect(summary.delivered).toBe(1)
    expect(summary.pruned).toBe(1)
    // Only the dead one, and the live one keeps working.
    const del = prisma.pushSubscription.deleteMany.mock.calls[0][0]
    expect(del.where.endpoint.in).toEqual(["https://push.example/dead"])
  })
})

describe("dispatchDuePushes — subscription upkeep", () => {
  it("deletes a subscription the push service says is gone", async () => {
    mockSend.mockResolvedValue({ status: "gone", code: 410 })

    const summary = await dispatchDuePushes(NOW)

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalled()
    // Deleted AND not claimed: a gone endpoint delivered nothing.
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled()
    expect(summary.deferred).toBe(1)
  })

  it("keeps a subscription that merely failed transiently", async () => {
    mockSend.mockResolvedValue({ status: "failed", code: 500, message: "boom" })

    await dispatchDuePushes(NOW)

    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled()
  })

  it("records a success timestamp, so a never-working browser is visible", async () => {
    await dispatchDuePushes(NOW)

    const call = prisma.pushSubscription.updateMany.mock.calls[0][0]
    expect(call.where.endpoint.in).toEqual([SUB.endpoint])
    expect(call.data.lastSuccessAt).toEqual(NOW)
  })
})

describe("dispatchDuePushes — the due query", () => {
  it("uses the shared window, not its own idea of due", async () => {
    // These three definitions drifted once already and the copy that drifted was
    // the one feeding notifications.
    await dispatchDuePushes(NOW)

    const { where, take } = prisma.reminder.findMany.mock.calls[0][0]
    expect(where.userId).toBe("u1")
    expect(where.dispatchedAt).toBeNull()
    expect(where.triggerAt.lte).toEqual(NOW)
    expect(take).toBe(5)
  })

  it("sends the task title, because the worker has no other way to name it", async () => {
    await dispatchDuePushes(NOW)

    const [, payload] = mockSend.mock.calls[0]
    expect(payload).toEqual({
      type: "reminder",
      reminderId: "r1",
      taskId: "t1",
      title: "Ship it",
    })
  })
})
