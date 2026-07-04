import { subtaskProgress, groupSubtasksByParent, topLevelTasks } from "@/lib/subtasks"
import type { Task } from "@/types/task"

const mk = (id: string, o: Partial<Task> = {}): Task =>
  ({
    id,
    title: id,
    status: o.status ?? "todo",
    priority: "medium",
    dueDate: null,
    order: o.order,
    parentTaskId: o.parentTaskId ?? null,
  } as Task)

describe("subtaskProgress", () => {
  it("returns 0/0 for no subtasks", () => {
    expect(subtaskProgress(undefined)).toEqual({ done: 0, total: 0 })
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 })
  })

  it("counts completed vs total", () => {
    const subs = [mk("a", { status: "completed" }), mk("b", { status: "todo" }), mk("c", { status: "completed" })]
    expect(subtaskProgress(subs)).toEqual({ done: 2, total: 3 })
  })

  it("only 'completed' counts as done (wont-do does not)", () => {
    const subs = [mk("a", { status: "wont-do" }), mk("b", { status: "in-progress" })]
    expect(subtaskProgress(subs)).toEqual({ done: 0, total: 2 })
  })
})

describe("groupSubtasksByParent", () => {
  it("groups children by parentTaskId, order-sorted", () => {
    const tasks = [
      mk("p1"),
      mk("c2", { parentTaskId: "p1", order: 20 }),
      mk("c1", { parentTaskId: "p1", order: 10 }),
      mk("orphanChild", { parentTaskId: "p2", order: 0 }),
    ]
    const map = groupSubtasksByParent(tasks)
    expect(map.p1.map((t) => t.id)).toEqual(["c1", "c2"])
    expect(map.p2.map((t) => t.id)).toEqual(["orphanChild"])
    expect(map.orphanChild).toBeUndefined()
  })

  it("returns an empty object when there are no subtasks", () => {
    expect(groupSubtasksByParent([mk("a"), mk("b")])).toEqual({})
  })
})

describe("topLevelTasks", () => {
  it("keeps only tasks with no parent (null or undefined)", () => {
    const tasks = [mk("a"), mk("b", { parentTaskId: "a" }), { id: "c", title: "c", status: "todo", priority: "medium" } as Task]
    expect(topLevelTasks(tasks).map((t) => t.id)).toEqual(["a", "c"])
  })
})
