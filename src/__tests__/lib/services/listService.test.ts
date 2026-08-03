/**
 * listService: the mobile API's list domain logic. Exercises ownership scoping on
 * every mutation, the spaced `order` allocation on create, validation boundaries,
 * and the fact that deleting a list leaves its tasks to the DB's onDelete: SetNull
 * (i.e. they fall back to the Inbox rather than being deleted here).
 */
jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}))

import { getLists, createList, updateList, deleteList, reorderList } from "@/lib/services/listService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) also drains mockResolvedValueOnce queues so
  // an over-queued value from one test can't leak into the next.
  jest.resetAllMocks()
  // The global mock client has no `list` model — the service needs one.
  prisma.list = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  }
})

describe("listService.getLists", () => {
  it("scopes the query to the caller and orders by order then createdAt", async () => {
    prisma.list.findMany.mockResolvedValue([{ id: "l1" }])

    await expect(getLists("u1")).resolves.toEqual([{ id: "l1" }])

    expect(prisma.list.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })
  })
})

describe("listService.createList", () => {
  it("appends at max(order) + 10 and stamps the caller as owner", async () => {
    prisma.list.aggregate.mockResolvedValue({ _max: { order: 40 } })
    prisma.list.create.mockResolvedValue({ id: "l2" })

    await createList("u1", { name: "Work", color: "#ff0000" })

    const data = prisma.list.create.mock.calls[0][0].data
    expect(data).toEqual({ name: "Work", color: "#ff0000", order: 50, userId: "u1" })
    // The aggregate must not see other users' lists, or ordering leaks across accounts.
    expect(prisma.list.aggregate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      _max: { order: true },
    })
  })

  it("starts the first list at order 10 when the user has none", async () => {
    prisma.list.aggregate.mockResolvedValue({ _max: { order: null } })
    prisma.list.create.mockResolvedValue({ id: "l1" })

    await createList("u1", { name: "First" })

    expect(prisma.list.create.mock.calls[0][0].data.order).toBe(10)
  })

  it("rejects an empty name without hitting the database", async () => {
    await expect(createList("u1", { name: "" })).rejects.toBeDefined()
    expect(prisma.list.create).not.toHaveBeenCalled()
  })

  it("rejects a name longer than 100 characters", async () => {
    await expect(createList("u1", { name: "x".repeat(101) })).rejects.toBeDefined()
    expect(prisma.list.create).not.toHaveBeenCalled()
  })

  it("rejects a non-string name (e.g. a JSON number from a sloppy client)", async () => {
    await expect(createList("u1", { name: 42 })).rejects.toBeDefined()
    expect(prisma.list.create).not.toHaveBeenCalled()
  })

  it("rejects a whitespace-only name instead of persisting a blank label", async () => {
    // `.min(1)` alone passes "   ", so the schema trims FIRST — create and update
    // now agree, where create used to accept exactly what update rejected.
    await expect(createList("u1", { name: "   " })).rejects.toBeDefined()
    expect(prisma.list.create).not.toHaveBeenCalled()
  })

  it("stores the trimmed name", async () => {
    prisma.list.create.mockResolvedValue({ id: "l1" })

    await createList("u1", { name: "  Work  " })

    expect(prisma.list.create.mock.calls[0][0].data.name).toBe("Work")
  })
})

describe("listService.updateList", () => {
  it("404s a list owned by another user and never writes", async () => {
    prisma.list.findFirst.mockResolvedValue(null)

    await expect(updateList("attacker", "victim-list", { name: "pwn" })).rejects.toMatchObject({
      status: 404,
    })
    expect(prisma.list.update).not.toHaveBeenCalled()
    // Ownership is enforced by the lookup, so it must be filtered by userId.
    expect(prisma.list.findFirst).toHaveBeenCalledWith({
      where: { id: "victim-list", userId: "attacker" },
    })
  })

  it("trims the new name before persisting it", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1" })
    prisma.list.update.mockResolvedValue({ id: "l1", name: "Work" })

    await updateList("u1", "l1", { name: "  Work  " })

    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { name: "Work" } })
  })

  it("rejects a whitespace-only name before it can blank an existing list", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1" })

    await expect(updateList("u1", "l1", { name: "   " })).rejects.toBeDefined()
    expect(prisma.list.update).not.toHaveBeenCalled()
  })

  it("clears the colour when null is sent, but leaves it alone when the key is absent", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1" })
    prisma.list.update.mockResolvedValue({ id: "l1" })

    await updateList("u1", "l1", { color: null })
    expect(prisma.list.update.mock.calls[0][0].data).toEqual({ color: null })

    await updateList("u1", "l1", { name: "Only name" })
    expect(prisma.list.update.mock.calls[1][0].data).toEqual({ name: "Only name" })
  })

  it("writes nothing for a body with no updatable fields", async () => {
    // Every field is optional so `{}` validates, but writing it bumped updatedAt
    // for a request that changed nothing — and updatedAt is the archived views'
    // sort key, so a no-op PATCH could reshuffle a list.
    prisma.list.findFirst.mockResolvedValue({ id: "l1", name: "Work" })

    await expect(updateList("u1", "l1", {})).resolves.toEqual({ id: "l1", name: "Work" })
    expect(prisma.list.update).not.toHaveBeenCalled()
  })

  it("rejects an over-long colour value", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1" })

    await expect(updateList("u1", "l1", { color: "c".repeat(31) })).rejects.toBeDefined()
    expect(prisma.list.update).not.toHaveBeenCalled()
  })
})

describe("listService.deleteList", () => {
  it("404s a list the caller doesn't own and never deletes", async () => {
    prisma.list.findFirst.mockResolvedValue(null)

    await expect(deleteList("attacker", "victim-list")).rejects.toMatchObject({ status: 404 })
    expect(prisma.list.delete).not.toHaveBeenCalled()
  })

  it("deletes an owned list without touching its tasks — SetNull re-parents them to the Inbox", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1", userId: "u1" })
    prisma.task.updateMany = jest.fn()
    prisma.task.deleteMany = jest.fn()

    await expect(deleteList("u1", "l1")).resolves.toEqual({ success: true })

    expect(prisma.list.delete).toHaveBeenCalledWith({ where: { id: "l1" } })
    // Deleting the list must never cascade into deleting the user's tasks.
    expect(prisma.task.deleteMany).not.toHaveBeenCalled()
    expect(prisma.task.updateMany).not.toHaveBeenCalled()
  })
})

describe("listService.reorderList", () => {
  it("404s when the list isn't the caller's", async () => {
    prisma.list.findFirst.mockResolvedValue(null)

    await expect(reorderList("attacker", "victim-list", 5)).rejects.toMatchObject({ status: 404 })
    expect(prisma.list.update).not.toHaveBeenCalled()
  })

  it("writes only the new order for an owned list", async () => {
    prisma.list.findFirst.mockResolvedValue({ id: "l1" })
    prisma.list.update.mockResolvedValue({ id: "l1", order: 25 })

    await reorderList("u1", "l1", 25)

    expect(prisma.list.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { order: 25 } })
  })
})
