import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import TaskReminderFields from "@/components/tasks/TaskReminderFields"

// Controlled harness so add/remove flow through real state.
function Harness({ initial = [] as string[] }) {
  const [reminders, setReminders] = useState<string[]>(initial)
  return (
    <div>
      <TaskReminderFields reminders={reminders} onChange={setReminders} />
      <output data-testid="count">{reminders.length}</output>
    </div>
  )
}

describe("TaskReminderFields", () => {
  it("adds a reminder from the datetime input", async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "2026-07-10T14:30" } })
    await userEvent.click(screen.getByRole("button", { name: "Add reminder" }))
    expect(screen.getByText(/2026-07-10 14:30/)).toBeInTheDocument()
    expect(screen.getByTestId("count").textContent).toBe("1")
  })

  it("does not add a duplicate", async () => {
    render(<Harness initial={["2026-07-10T14:30"]} />)
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "2026-07-10T14:30" } })
    await userEvent.click(screen.getByRole("button", { name: "Add reminder" }))
    expect(screen.getByTestId("count").textContent).toBe("1")
  })

  it("removes a reminder", async () => {
    render(<Harness initial={["2026-07-10T14:30"]} />)
    await userEvent.click(screen.getByRole("button", { name: /Remove reminder/ }))
    expect(screen.queryByText(/2026-07-10 14:30/)).not.toBeInTheDocument()
    expect(screen.getByTestId("count").textContent).toBe("0")
  })
})
