import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { addDays } from "date-fns"
import QuickAddBar from "@/components/tasks/QuickAddBar"

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`

jest.mock("@/app/actions/tasks", () => ({ createTask: jest.fn() }))
jest.mock("@/lib/taskEvents", () => ({ dispatchTaskUpdate: jest.fn() }))

const mockCreateTask = require("@/app/actions/tasks").createTask as jest.Mock

describe("QuickAddBar", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateTask.mockResolvedValue({ success: true, task: { id: "t1" } })
  })

  const input = () => screen.getByLabelText(/quick add a task/i)

  it("renders the omnibar", () => {
    render(<QuickAddBar />)
    expect(input()).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument()
  })

  it("shows a live parse preview as you type", async () => {
    render(<QuickAddBar />)
    await userEvent.type(input(), "Ship #work !high tomorrow")
    expect(screen.getByText("Ship")).toBeInTheDocument()
    expect(screen.getByText("#work")).toBeInTheDocument()
    expect(screen.getByText("!high")).toBeInTheDocument()
    expect(screen.getByText(/📅 \d{4}-\d{2}-\d{2}/)).toBeInTheDocument()
  })

  it("creates a task from a deterministic line without calling the AI", async () => {
    const onCreated = jest.fn()
    render(<QuickAddBar onCreated={onCreated} />)

    await userEvent.type(input(), "Pay rent tomorrow #home !high")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    const arg = mockCreateTask.mock.calls[0][0]
    expect(arg).toEqual(
      expect.objectContaining({ title: "Pay rent", tags: ["home"], priority: "high" }),
    )
    expect(arg.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalled()
    await waitFor(() => expect(input()).toHaveValue(""))
  })

  it("uses the AI fallback for a fuzzy date, sending token-stripped text", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Demo", dueDate: "2026-07-24" }),
    })
    render(<QuickAddBar />)

    await userEvent.type(input(), "Demo next friday #work")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/ai/quick-add",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.text).toBe("Demo next friday")

    await waitFor(() =>
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Demo", dueDate: "2026-07-24", tags: ["work"] }),
      ),
    )
  })

  it("still creates the task when the AI fallback fails", async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error("no ai"))
    render(<QuickAddBar />)

    await userEvent.type(input(), "Demo next friday")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    const arg = mockCreateTask.mock.calls[0][0]
    expect(arg.title).toBe("Demo next friday")
    expect(arg.dueDate).toBeUndefined()
  })

  it("does not call the AI for a plain title with no date hint", async () => {
    render(<QuickAddBar />)
    await userEvent.type(input(), "Buy milk")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("adds into the active list when one is provided", async () => {
    render(<QuickAddBar listId="list-9" />)
    await userEvent.type(input(), "Buy milk")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() =>
      expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ listId: "list-9" })),
    )
  })

  it("submits on Enter", async () => {
    render(<QuickAddBar />)
    await userEvent.type(input(), "Buy milk{Enter}")
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
  })

  it("surfaces a createTask error and keeps the text", async () => {
    mockCreateTask.mockResolvedValue({ error: "Failed to create task" })
    render(<QuickAddBar />)
    await userEvent.type(input(), "Buy milk")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(screen.getByText("Failed to create task")).toBeInTheDocument())
    expect(input()).toHaveValue("Buy milk")
  })

  it("adopts an AI-cleaned title but keeps no date when the model returns dueDate null", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Draft the memo", dueDate: null }),
    })
    render(<QuickAddBar />)

    await userEvent.type(input(), "draft the memo end of month")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    const arg = mockCreateTask.mock.calls[0][0]
    expect(arg.title).toBe("Draft the memo")
    expect(arg.dueDate).toBeUndefined()
  })

  it("passes the parser's local-midnight due date straight through to createTask", async () => {
    render(<QuickAddBar />)
    await userEvent.type(input(), "Pay rent tomorrow")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled())
    expect(mockCreateTask.mock.calls[0][0].dueDate).toBe(ymd(addDays(new Date(), 1)))
  })

  it("disables the input while a create is in flight and guards against double-submit", async () => {
    let resolveCreate: (v: any) => void = () => {}
    mockCreateTask.mockReturnValue(new Promise((r) => { resolveCreate = r }))
    render(<QuickAddBar />)

    await userEvent.type(input(), "Buy milk")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    // In flight: the button reads "Adding…" and both controls are disabled.
    expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled()
    expect(input()).toBeDisabled()

    resolveCreate({ success: true, task: { id: "t1" } })
    await waitFor(() => expect(input()).toHaveValue(""))
    expect(mockCreateTask).toHaveBeenCalledTimes(1)
  })
})
