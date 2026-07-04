import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockGetGoalTasks = jest.fn()
const mockCompleteTask = jest.fn().mockResolvedValue({ success: true })
const mockUpdateTask = jest.fn().mockResolvedValue({ success: true })
jest.mock("@/app/actions/goals", () => ({
  getGoalTasks: (...a: any) => mockGetGoalTasks(...a),
}))
jest.mock("@/app/actions/tasks", () => ({
  completeTask: (...a: any) => mockCompleteTask(...a),
  updateTask: (...a: any) => mockUpdateTask(...a),
}))

import GoalDetail from "@/components/goals/GoalDetail"
import type { Goal } from "@/types/goal"

const goal: Goal = {
  id: "g1",
  title: "Read 12 books",
  icon: "🎯",
  color: "primary",
  progressType: "tasks",
  targetValue: null,
  currentValue: 0,
  unit: null,
  manualProgress: 0,
  targetDate: null,
  status: "active",
  taskTotal: 2,
  taskCompleted: 1,
}

describe("GoalDetail", () => {
  beforeEach(() => jest.clearAllMocks())

  it("lists the goal's linked tasks under its header", async () => {
    mockGetGoalTasks.mockResolvedValue([
      { id: "t1", title: "Chapter 1", status: "completed", dueDate: null },
      { id: "t2", title: "Chapter 2", status: "todo", dueDate: null },
    ])
    render(<GoalDetail goal={goal} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByText("Chapter 1")).toBeInTheDocument()
    expect(screen.getByText("Chapter 2")).toBeInTheDocument()
    expect(screen.getByText("Read 12 books")).toBeInTheDocument()
    // tasks-goal progress from the prop counts: 1/2 = 50%
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("completing a task calls completeTask then onChanged", async () => {
    mockGetGoalTasks.mockResolvedValue([{ id: "t2", title: "Chapter 2", status: "todo", dueDate: null }])
    const onChanged = jest.fn()
    render(<GoalDetail goal={goal} onClose={() => {}} onChanged={onChanged} />)
    await screen.findByText("Chapter 2")
    await userEvent.click(screen.getByRole("checkbox", { name: "Complete Chapter 2" }))
    await waitFor(() => expect(mockCompleteTask).toHaveBeenCalledWith("t2"))
    expect(onChanged).toHaveBeenCalled()
  })

  it("reopening a completed task calls updateTask(todo)", async () => {
    mockGetGoalTasks.mockResolvedValue([{ id: "t1", title: "Chapter 1", status: "completed", dueDate: null }])
    render(<GoalDetail goal={goal} onClose={() => {}} onChanged={() => {}} />)
    await screen.findByText("Chapter 1")
    await userEvent.click(screen.getByRole("checkbox", { name: "Complete Chapter 1" }))
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith("t1", { status: "todo" }))
  })

  it("shows an empty state when no tasks are linked", async () => {
    mockGetGoalTasks.mockResolvedValue([])
    render(<GoalDetail goal={goal} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByText(/No tasks linked yet/)).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    mockGetGoalTasks.mockResolvedValue([])
    const onClose = jest.fn()
    render(<GoalDetail goal={goal} onClose={onClose} onChanged={() => {}} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })
})
