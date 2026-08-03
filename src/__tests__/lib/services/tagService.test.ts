/**
 * tagService: the mobile API's tag domain logic. Exercises ownership scoping,
 * name normalisation (commas are the wire delimiter for tags, so they must never
 * survive into a stored name), the whitespace-only rejection the Zod `.min(1)`
 * cannot catch, and the P2002 -> 409 mapping for a rename onto an existing tag.
 */
jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
}))

import { getTags, updateTag, deleteTag } from "@/lib/services/tagService"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = (global as any).__mockPrismaClient

/** Shape of the error Prisma throws on a @@unique violation. */
function uniqueViolation() {
  const e = new Error("Unique constraint failed on the fields: (`userId`,`name`)")
  ;(e as Error & { code?: string }).code = "P2002"
  return e
}

beforeEach(() => {
  jest.resetAllMocks()
  // The global mock client has no `tag` model — the service needs one.
  prisma.tag = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  }
})

describe("tagService.getTags", () => {
  it("returns only the caller's tags, ordered by order then name", async () => {
    prisma.tag.findMany.mockResolvedValue([{ id: "g1", name: "admin" }])

    await expect(getTags("u1")).resolves.toEqual([{ id: "g1", name: "admin" }])

    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    })
  })
})

describe("tagService.updateTag", () => {
  it("404s a tag belonging to another user and never writes", async () => {
    prisma.tag.findFirst.mockResolvedValue(null)

    await expect(updateTag("attacker", "victim-tag", { name: "pwn" })).rejects.toMatchObject({
      status: 404,
    })
    expect(prisma.tag.update).not.toHaveBeenCalled()
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({
      where: { id: "victim-tag", userId: "attacker" },
    })
  })

  it("strips commas from the name — they are the wire delimiter, not part of a tag", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })
    prisma.tag.update.mockResolvedValue({ id: "g1", name: "deep work" })

    await updateTag("u1", "g1", { name: "deep, work" })

    expect(prisma.tag.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { name: "deep work" },
    })
  })

  it("collapses surrounding and repeated whitespace introduced by normalisation", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })
    prisma.tag.update.mockResolvedValue({ id: "g1" })

    await updateTag("u1", "g1", { name: "  side   project  " })

    expect(prisma.tag.update.mock.calls[0][0].data.name).toBe("side project")
  })

  it("400s a whitespace-only name that the schema's min(1) let through", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })

    await expect(updateTag("u1", "g1", { name: "   " })).rejects.toMatchObject({ status: 400 })
    expect(prisma.tag.update).not.toHaveBeenCalled()
  })

  it("400s a name made only of commas, which normalises away to nothing", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })

    await expect(updateTag("u1", "g1", { name: ",,," })).rejects.toMatchObject({ status: 400 })
    expect(prisma.tag.update).not.toHaveBeenCalled()
  })

  it("rejects a name longer than 50 characters before any lookup", async () => {
    await expect(updateTag("u1", "g1", { name: "x".repeat(51) })).rejects.toBeDefined()
    expect(prisma.tag.findFirst).not.toHaveBeenCalled()
  })

  it("maps a P2002 unique violation to 409, not a 500", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1", name: "old" })
    prisma.tag.update.mockRejectedValue(uniqueViolation())

    await expect(updateTag("u1", "g1", { name: "work" })).rejects.toMatchObject({
      status: 409,
      message: "You already have a tag with that name",
    })
  })

  it("rethrows a non-P2002 Prisma failure so it becomes a 500 rather than a bogus 409", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })
    const boom = new Error("connection lost")
    ;(boom as Error & { code?: string }).code = "P1001"
    prisma.tag.update.mockRejectedValue(boom)

    await expect(updateTag("u1", "g1", { name: "work" })).rejects.toThrow("connection lost")
  })

  it("recolors without renaming when only color is supplied, and accepts null to clear it", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1" })
    prisma.tag.update.mockResolvedValue({ id: "g1" })

    await updateTag("u1", "g1", { color: "#00ff00" })
    expect(prisma.tag.update.mock.calls[0][0].data).toEqual({ color: "#00ff00" })

    await updateTag("u1", "g1", { color: null })
    expect(prisma.tag.update.mock.calls[1][0].data).toEqual({ color: null })
  })
})

describe("tagService.deleteTag", () => {
  it("404s a tag the caller doesn't own and never deletes", async () => {
    prisma.tag.findFirst.mockResolvedValue(null)

    await expect(deleteTag("attacker", "victim-tag")).rejects.toMatchObject({ status: 404 })
    expect(prisma.tag.delete).not.toHaveBeenCalled()
  })

  it("deletes an owned tag and leaves the tasks that carried it intact", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "g1", userId: "u1" })
    prisma.task.deleteMany = jest.fn()

    await expect(deleteTag("u1", "g1")).resolves.toEqual({ success: true })

    expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: "g1" } })
    // Only the TaskTag join rows cascade; the tasks themselves must survive.
    expect(prisma.task.deleteMany).not.toHaveBeenCalled()
  })
})
