/**
 * Unit tests for the SmartListSidebar "Saved" section (Phase 4b).
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import SmartListSidebar from "@/components/tasks/SmartListSidebar"

const baseProps = () => ({
  tasks: [],
  now: new Date(),
  activeHorizon: "all" as const,
  onSelectHorizon: jest.fn(),
  lists: [],
  activeListId: undefined,
  onSelectList: jest.fn(),
  onCreateList: jest.fn(),
  onDeleteList: jest.fn(),
  savedFilters: [],
  activeSavedId: null,
  onSaveFilter: jest.fn().mockResolvedValue({ success: true }),
  onApplyFilter: jest.fn(),
  onDeleteFilter: jest.fn(),
})

describe("SmartListSidebar — Saved views", () => {
  it("shows an empty state when there are no saved views", () => {
    render(<SmartListSidebar {...baseProps()} />)
    expect(screen.getByText(/Filter your tasks, then save the view/i)).toBeInTheDocument()
  })

  it("applies a saved view's query on click", () => {
    const props = baseProps()
    props.savedFilters = [{ id: "s1", name: "Work", query: "priority=high" }]
    render(<SmartListSidebar {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Work" }))
    expect(props.onApplyFilter).toHaveBeenCalledWith("priority=high")
  })

  it("marks the active saved view", () => {
    const props = baseProps()
    props.savedFilters = [{ id: "s1", name: "Work", query: "priority=high" }]
    props.activeSavedId = "s1"
    render(<SmartListSidebar {...props} />)

    expect(screen.getByRole("button", { name: "Work" })).toHaveAttribute("aria-current", "page")
  })

  it("deletes a saved view", () => {
    const props = baseProps()
    props.savedFilters = [{ id: "s1", name: "Work", query: "priority=high" }]
    render(<SmartListSidebar {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Delete saved view Work" }))
    expect(props.onDeleteFilter).toHaveBeenCalledWith("s1")
  })

  it("saves the current view under a typed name", async () => {
    const props = baseProps()
    render(<SmartListSidebar {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }))
    const input = screen.getByLabelText("Saved view name")
    fireEvent.change(input, { target: { value: "High priority" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(props.onSaveFilter).toHaveBeenCalledWith("High priority"))
  })

  it("keeps the input open and surfaces a duplicate-name error", async () => {
    const props = baseProps()
    props.onSaveFilter = jest
      .fn()
      .mockResolvedValue({ error: "A saved view with that name already exists" })
    render(<SmartListSidebar {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }))
    const input = screen.getByLabelText("Saved view name")
    fireEvent.change(input, { target: { value: "Work" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    // input is still present for correction
    expect(screen.getByLabelText("Saved view name")).toBeInTheDocument()
  })

  it("saves the corrected name on blur after a duplicate error (no swallowed blur)", async () => {
    const props = baseProps()
    const onSaveFilter = jest
      .fn()
      .mockResolvedValueOnce({ error: "A saved view with that name already exists" })
      .mockResolvedValueOnce({ success: true })
    props.onSaveFilter = onSaveFilter
    render(<SmartListSidebar {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }))
    const input = screen.getByLabelText("Saved view name")
    fireEvent.change(input, { target: { value: "Work" } })
    fireEvent.keyDown(input, { key: "Enter" }) // duplicate → error, input stays
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()

    // Correct the name and click away — the blur must save (not be swallowed).
    fireEvent.change(input, { target: { value: "Work2" } })
    fireEvent.blur(input)

    await waitFor(() => expect(onSaveFilter).toHaveBeenCalledTimes(2))
    expect(onSaveFilter).toHaveBeenLastCalledWith("Work2")
  })
})
