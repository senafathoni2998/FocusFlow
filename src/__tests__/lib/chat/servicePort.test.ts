/**
 * @jest-environment node
 *
 * The service-backed ChatPort. Its whole job is translating between two error
 * conventions — services throw ApiError, the shared dispatch reads `{ error }` —
 * and getting that wrong means the assistant either reports success on a failed
 * write or takes the whole turn down.
 */
jest.mock("@/lib/services/taskService", () => ({
  listTasks: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  completeTask: jest.fn(),
  deleteTask: jest.fn(),
}))
jest.mock("@/lib/services/goalService", () => ({
  getGoals: jest.fn(),
  createGoal: jest.fn(),
  updateGoal: jest.fn(),
  adjustGoalProgress: jest.fn(),
  setGoalStatus: jest.fn(),
  deleteGoal: jest.fn(),
}))
jest.mock("@/lib/services/habitService", () => ({
  getHabits: jest.fn(),
  createHabit: jest.fn(),
  checkInHabit: jest.fn(),
  deleteHabit: jest.fn(),
}))
jest.mock("@/lib/services/reminderService", () => ({ getDueReminders: jest.fn() }))

import { createServicePort } from "@/lib/chat/servicePort"
import { ApiError } from "@/lib/apiResponse"
import * as tasks from "@/lib/services/taskService"
import * as goals from "@/lib/services/goalService"
import * as habits from "@/lib/services/habitService"

const port = createServicePort("u1")

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe("scoping", () => {
  it("passes the token's user to every call, never a caller-supplied id", async () => {
    ;(tasks.listTasks as jest.Mock).mockResolvedValue([])
    ;(tasks.createTask as jest.Mock).mockResolvedValue({ id: "t1" })

    await port.getTasks()
    await port.createTask({ title: "x" })

    expect(tasks.listTasks).toHaveBeenCalledWith("u1")
    expect(tasks.createTask).toHaveBeenCalledWith("u1", { title: "x" })
  })
})

describe("error translation", () => {
  it("turns a thrown ApiError into the { error } the dispatch reads", async () => {
    ;(tasks.updateTask as jest.Mock).mockRejectedValue(new ApiError(404, "Task not found"))

    expect(await port.updateTask("t1", { title: "x" })).toEqual({ error: "Task not found" })
  })

  it("does not leak an unexpected failure's message into a model prompt", async () => {
    // Whatever ends up here is read by the user and repeated by the model.
    ;(goals.deleteGoal as jest.Mock).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    )

    const res = await port.deleteGoal("g1")

    expect(res.error).toBe("Something went wrong")
    expect(JSON.stringify(res)).not.toContain("ECONNREFUSED")
  })

  it("wraps a success in the shape the dispatch expects", async () => {
    ;(goals.createGoal as jest.Mock).mockResolvedValue({ id: "g1", title: "Read" })

    expect(await port.createGoal({ title: "Read" })).toEqual({
      success: true,
      goal: { id: "g1", title: "Read" },
    })
  })

  it("reports whether a completion recurred, which the dispatch surfaces", async () => {
    ;(tasks.completeTask as jest.Mock).mockResolvedValue({ recurred: true, task: { id: "t1" } })

    expect(await port.completeTask("t1")).toEqual({
      success: true,
      recurred: true,
      task: { id: "t1" },
    })
  })
})

describe("checkInHabit", () => {
  it("lifts habitId out of the payload, since the service takes it separately", async () => {
    ;(habits.checkInHabit as jest.Mock).mockResolvedValue({ success: true })

    await port.checkInHabit({ habitId: "h1", delta: 2 })

    expect(habits.checkInHabit).toHaveBeenCalledWith("u1", "h1", { delta: 2 })
  })

  it("refuses a payload with no habitId instead of calling the service with undefined", async () => {
    expect(await port.checkInHabit({ delta: 1 })).toEqual({ error: "Habit not found" })
    expect(habits.checkInHabit).not.toHaveBeenCalled()
  })
})
