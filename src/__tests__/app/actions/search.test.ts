/**
 * @jest-environment node
 */
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn() },
    goal: { findMany: jest.fn() },
    habit: { findMany: jest.fn() },
    list: { findMany: jest.fn() },
  },
}))
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))

import { globalSearch } from "@/app/actions/search"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const p = prisma as unknown as Record<string, { findMany: jest.Mock }>
const mockAuth = auth as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "user-1" } })
  for (const m of ["task", "goal", "habit", "list"]) p[m].findMany.mockResolvedValue([])
})

describe("globalSearch", () => {
  it("returns nothing without a session and never touches the database", async () => {
    mockAuth.mockResolvedValue(null)
    expect(await globalSearch("report")).toEqual([])
    expect(p.task.findMany).not.toHaveBeenCalled()
  })

  it("ignores queries shorter than two characters", async () => {
    expect(await globalSearch("a")).toEqual([])
    expect(await globalSearch("   ")).toEqual([])
    expect(p.task.findMany).not.toHaveBeenCalled()
  })

  it("scopes every query to the session user", async () => {
    await globalSearch("report")
    for (const m of ["task", "goal", "habit", "list"]) {
      expect(p[m].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) }),
      )
    }
  })

  it("matches case-insensitively", async () => {
    await globalSearch("Report")
    const where = p.habit.findMany.mock.calls[0][0].where
    expect(where.name).toEqual({ contains: "Report", mode: "insensitive" })
  })

  it("excludes archived goals and habits", async () => {
    await globalSearch("report")
    expect(p.goal.findMany.mock.calls[0][0].where.status).toEqual({ not: "archived" })
    expect(p.habit.findMany.mock.calls[0][0].where.archived).toBe(false)
  })

  it("caps the query length so a huge string can't reach the database", async () => {
    await globalSearch("x".repeat(500))
    const where = p.habit.findMany.mock.calls[0][0].where
    expect(where.name.contains).toHaveLength(100)
  })

  it("tags each hit with its type", async () => {
    p.task.findMany.mockResolvedValue([{ id: "t1", title: "Write report", status: "todo" }])
    p.goal.findMany.mockResolvedValue([{ id: "g1", title: "Reporting", icon: "🎯", status: "active" }])
    p.habit.findMany.mockResolvedValue([{ id: "h1", name: "Report daily", icon: "📝" }])
    p.list.findMany.mockResolvedValue([{ id: "l1", name: "Reports" }])

    const hits = await globalSearch("report")

    expect(hits.map((h) => h.type)).toEqual(["task", "goal", "habit", "list"])
    expect(hits[0]).toEqual({ id: "t1", type: "task", title: "Write report", subtitle: "todo" })
  })

  it("returns an empty list rather than throwing when a query fails", async () => {
    p.task.findMany.mockRejectedValue(new Error("db down"))
    expect(await globalSearch("report")).toEqual([])
  })
})
