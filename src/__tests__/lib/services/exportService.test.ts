/**
 * @jest-environment node
 */
import { buildExport, exportFilename, EXPORT_FORMAT_VERSION } from "@/lib/services/exportService"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    list: { findMany: jest.fn() },
    tag: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    habit: { findMany: jest.fn() },
    goal: { findMany: jest.fn() },
    focusSession: { findMany: jest.fn() },
    savedFilter: { findMany: jest.fn() },
  },
}))

const p = prisma as unknown as Record<string, { findMany: jest.Mock; findUnique?: jest.Mock }>

beforeEach(() => {
  jest.clearAllMocks()
  ;(p.user.findUnique as jest.Mock).mockResolvedValue({
    id: "user-1",
    email: "a@b.com",
    name: "A",
    createdAt: new Date("2026-01-01"),
  })
  for (const model of ["list", "tag", "habit", "goal", "focusSession", "savedFilter"]) {
    p[model].findMany.mockResolvedValue([])
  }
  p.task.findMany.mockResolvedValue([])
})

describe("buildExport", () => {
  it("scopes every collection to the given user", async () => {
    await buildExport("user-1")

    for (const model of ["list", "tag", "task", "habit", "goal", "focusSession", "savedFilter"]) {
      expect(p[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) }),
      )
    }
  })

  it("never includes the password hash or AI keys", async () => {
    await buildExport("user-1")

    const select = (p.user.findUnique as jest.Mock).mock.calls[0][0].select
    expect(select).toEqual({ id: true, email: true, name: true, createdAt: true })
    expect(select).not.toHaveProperty("password")
  })

  it("flattens TaskTag joins into plain tag rows", async () => {
    p.task.findMany.mockResolvedValue([
      { id: "t1", title: "Task", tags: [{ tag: { id: "g1", name: "work" } }] },
    ])

    const out = await buildExport("user-1")

    expect(out.tasks[0].tags).toEqual([{ id: "g1", name: "work" }])
  })

  it("stamps a format version and per-collection counts", async () => {
    p.task.findMany.mockResolvedValue([{ id: "t1", tags: [] }, { id: "t2", tags: [] }])

    const out = await buildExport("user-1")

    expect(out.formatVersion).toBe(EXPORT_FORMAT_VERSION)
    expect(out.counts.tasks).toBe(2)
    expect(typeof out.exportedAt).toBe("string")
  })
})

describe("exportFilename", () => {
  it("uses the local calendar day", () => {
    expect(exportFilename(new Date(2026, 7, 2))).toBe("focusflow-export-2026-08-02.json")
  })
})
