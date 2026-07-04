/**
 * Unit tests for src/app/api/chat/route.ts
 *
 * Tests cover:
 * - Authentication requirements
 * - Message validation
 * - API key configuration
 * - Function calling (createTask, updateTask, deleteTask, listTasks)
 * - Error handling
 * - Response format
 * - Chat history handling
 */

// Mock next/server - must be first due to hoisting
jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    constructor(url, init) {
      this.url = url
      this.method = init?.method || 'GET'
      this.headers = new Headers(init?.headers || {})
      this.body = init?.body
      this._bodyUsed = false
    }

    async json() {
      if (this._bodyUsed) {
        throw new TypeError('body used already')
      }
      this._bodyUsed = true
      if (typeof this.body === 'string') {
        return JSON.parse(this.body)
      }
      return this.body
    }
  },

  NextResponse: {
    json: (data: any, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "content-type": "application/json" },
      }),
  },
}))

// Mock OpenAI - inline to avoid hoisting issues
const mockChatCreate = jest.fn()
jest.mock("openai", () => {
  const mockOpenai = {
    chat: {
      completions: {
        create: (...args: any[]) => mockChatCreate(...args),
      },
    },
  }
  return {
    __esModule: true,
    default: jest.fn(() => mockOpenai),
  }
})

// Mock task actions - inline to avoid hoisting issues
const mockCreateTask = jest.fn()
const mockUpdateTask = jest.fn()
const mockDeleteTask = jest.fn()
const mockGetTasks = jest.fn()

jest.mock("@/app/actions/tasks", () => ({
  createTask: (...args: any[]) => mockCreateTask(...args),
  updateTask: (...args: any[]) => mockUpdateTask(...args),
  deleteTask: (...args: any[]) => mockDeleteTask(...args),
  getTasks: (...args: any[]) => mockGetTasks(...args),
}))

// Mock goal actions (they pull prisma/next-cache, so must be mocked)
const mockGetGoals = jest.fn()
const mockCreateGoal = jest.fn()
const mockUpdateGoal = jest.fn()
const mockAdjustGoalProgress = jest.fn()
const mockSetGoalStatus = jest.fn()
const mockDeleteGoal = jest.fn()
jest.mock("@/app/actions/goals", () => ({
  getGoals: (...args: any[]) => mockGetGoals(...args),
  createGoal: (...args: any[]) => mockCreateGoal(...args),
  updateGoal: (...args: any[]) => mockUpdateGoal(...args),
  adjustGoalProgress: (...args: any[]) => mockAdjustGoalProgress(...args),
  setGoalStatus: (...args: any[]) => mockSetGoalStatus(...args),
  deleteGoal: (...args: any[]) => mockDeleteGoal(...args),
}))

// Mock habit actions
const mockGetHabits = jest.fn()
const mockCreateHabit = jest.fn()
const mockCheckInHabit = jest.fn()
const mockDeleteHabit = jest.fn()
jest.mock("@/app/actions/habits", () => ({
  getHabits: (...args: any[]) => mockGetHabits(...args),
  createHabit: (...args: any[]) => mockCreateHabit(...args),
  checkInHabit: (...args: any[]) => mockCheckInHabit(...args),
  deleteHabit: (...args: any[]) => mockDeleteHabit(...args),
}))

// Mock reminder actions
const mockGetDueReminders = jest.fn()
jest.mock("@/app/actions/reminders", () => ({
  getDueReminders: (...args: any[]) => mockGetDueReminders(...args),
}))

// Mock auth
const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({
  auth: (...args: any[]) => mockAuth(...args),
}))

// Import route after mocks are set up
import { POST } from "@/app/api/chat/route"

// Helper to create a mock request
const createRequest = async (body: any): Promise<any> => {
  return {
    json: async () => body,
  }
}

describe("Chat API Route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set default environment variable
    process.env.GROQ_API_KEY = "test-api-key"
    // The route fetches all four pillars for context on every request — default
    // the new pillar getters so the Promise.all always resolves cleanly.
    mockGetGoals.mockResolvedValue([])
    mockGetHabits.mockResolvedValue([])
    mockGetDueReminders.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.GROQ_API_KEY
  })

  describe("Authentication", () => {
    it("should return 401 when no session exists", async () => {
      mockAuth.mockResolvedValue(null)

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("Unauthorized")
    })

    it("should return 401 when session has no user", async () => {
      mockAuth.mockResolvedValue({})

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("Unauthorized")
    })

    it("should return 401 when session has no user.id", async () => {
      mockAuth.mockResolvedValue({
        user: { name: "Test User" },
      })

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("Unauthorized")
    })

    it("should allow access with valid session", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([])
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello! How can I help you today?" } }],
      })

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe("Hello! How can I help you today?")
    })
  })

  describe("Message Validation", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
    })

    it("should return 400 when message is missing", async () => {
      const request = await createRequest({})

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Message is required")
    })

    it("should return 400 when message is not a string", async () => {
      const request = await createRequest({
        message: 123,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Message is required")
    })

    it("should return 400 when message is empty string", async () => {
      const request = await createRequest({
        message: "",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Message is required")
    })

    it("should accept empty history array", async () => {
      mockGetTasks.mockResolvedValue([])
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      })

      const request = await createRequest({
        message: "Hello",
        history: [],
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe("Hello!")
    })

    it("should accept history array with messages", async () => {
      mockGetTasks.mockResolvedValue([])
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello again!" } }],
      })

      const request = await createRequest({
        message: "Hello again",
        history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Hi" }),
            expect.objectContaining({ role: "assistant", content: "Hello!" }),
            expect.objectContaining({ role: "user", content: "Hello again" }),
          ]),
        })
      )
    })
  })

  describe("API Configuration", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
    })

    it("should return 500 when GROQ_API_KEY is not set", async () => {
      delete process.env.GROQ_API_KEY

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("AI service not configured")
      expect(data.message).toContain("contact the administrator")
    })
  })

  describe("Function Calling - createTask", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([])
    })

    it("should call createTask when AI requests it", async () => {
      const newTask = {
        id: "task-123",
        title: "New Task",
        description: "Test description",
        priority: "high",
      }

      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "createTask",
                arguments: JSON.stringify({
                  title: "New Task",
                  description: "Test description",
                  priority: "high",
                }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "I've created the task 'New Task' for you." },
          }],
        })

      mockCreateTask.mockResolvedValue({ task: newTask })

      const request = await createRequest({
        message: "Create a task called New Task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(mockCreateTask).toHaveBeenCalledWith({
        title: "New Task",
        description: "Test description",
        priority: "high",
      })
      expect(data.functionCall?.name).toBe("createTask")
      expect(data.functionCall?.result?.task).toEqual(newTask)
      expect(data.message).toBe("I've created the task 'New Task' for you.")
    })

    it("should handle createTask errors gracefully", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "createTask",
                arguments: JSON.stringify({ title: "New Task" }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "Sorry, there was an error creating the task." },
          }],
        })

      mockCreateTask.mockResolvedValue({
        error: "Failed to create task",
      })

      const request = await createRequest({
        message: "Create a task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.functionCall?.name).toBe("createTask")
      expect(data.functionCall?.result?.error).toBe("Failed to create task")
    })
  })

  describe("Function Calling - updateTask", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([
        {
          id: "task-123",
          title: "Existing Task",
          status: "todo",
          priority: "medium",
        },
      ])
    })

    it("should call updateTask when AI requests it", async () => {
      const updatedTask = {
        id: "task-123",
        title: "Existing Task",
        status: "completed",
        priority: "high",
      }

      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "updateTask",
                arguments: JSON.stringify({
                  id: "task-123",
                  status: "completed",
                  priority: "high",
                }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "I've marked 'Existing Task' as completed." },
          }],
        })

      mockUpdateTask.mockResolvedValue({ task: updatedTask })

      const request = await createRequest({
        message: "Mark Existing Task as completed",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(mockUpdateTask).toHaveBeenCalledWith("task-123", {
        id: "task-123",
        status: "completed",
        priority: "high",
      })
      expect(data.functionCall?.name).toBe("updateTask")
      expect(data.functionCall?.result?.task).toEqual(updatedTask)
    })

    it("should handle updateTask errors gracefully", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "updateTask",
                arguments: JSON.stringify({
                  id: "task-123",
                  status: "completed",
                }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "Sorry, I couldn't update that task." },
          }],
        })

      mockUpdateTask.mockResolvedValue({
        error: "Task not found",
      })

      const request = await createRequest({
        message: "Update task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.functionCall?.result?.error).toBe("Task not found")
    })
  })

  describe("Function Calling - deleteTask", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([])
    })

    it("should call deleteTask when AI requests it", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "deleteTask",
                arguments: JSON.stringify({ id: "task-123" }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "Task deleted successfully." },
          }],
        })

      mockDeleteTask.mockResolvedValue({ success: true })

      const request = await createRequest({
        message: "Delete the task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(mockDeleteTask).toHaveBeenCalledWith("task-123")
      expect(data.functionCall?.name).toBe("deleteTask")
      expect(data.functionCall?.result?.success).toBe(true)
    })

    it("should handle deleteTask errors gracefully", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "deleteTask",
                arguments: JSON.stringify({ id: "task-123" }),
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "I couldn't delete that task." },
          }],
        })

      mockDeleteTask.mockResolvedValue({
        error: "Task not found",
      })

      const request = await createRequest({
        message: "Delete task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.functionCall?.result?.error).toBe("Task not found")
    })
  })

  describe("Function Calling - listTasks", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
    })

    it("should call getTasks when AI requests listTasks", async () => {
      const tasks = [
        { id: "task-1", title: "Task 1", status: "todo", priority: "high" },
        { id: "task-2", title: "Task 2", status: "completed", priority: "low" },
      ]

      mockGetTasks.mockResolvedValue(tasks)

      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "listTasks",
                arguments: "{}",
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: { content: "You have 2 tasks." },
          }],
        })

      const request = await createRequest({
        message: "List my tasks",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(mockGetTasks).toHaveBeenCalledWith("user-123")
      expect(data.functionCall?.name).toBe("listTasks")
    })
  })

  describe("Error Handling", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
    })

    it("should handle invalid function call arguments", async () => {
      mockGetTasks.mockResolvedValue([])

      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            function_call: {
              name: "createTask",
              arguments: "invalid json{{{",
            },
          },
        }],
      })

      const request = await createRequest({
        message: "Create task",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain("trouble understanding")
    })

    it("should handle unknown function names", async () => {
      mockGetTasks.mockResolvedValue([])

      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            function_call: {
              name: "unknownFunction",
              arguments: "{}",
            },
          },
        }],
      })

      const request = await createRequest({
        message: "Do something",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain("not sure how to help")
    })

    it("should handle malformed JSON in request body", async () => {
      const request = {
        json: async () => {
          throw new Error("Invalid JSON")
        },
      }

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("Failed to process chat message")
    })
  })

  describe("Response Format", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([])
    })

    it("should return JSON response", async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      })

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)

      expect(response.headers.get("content-type")).toContain("application/json")
    })

    it("should return message field in response", async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "Test response" } }],
      })

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toBe("Test response")
    })

    it("should include functionCall when function is called", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              function_call: {
                name: "listTasks",
                arguments: "{}",
              },
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: "Here are your tasks" } }],
        })

      const request = await createRequest({
        message: "List tasks",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.functionCall).toBeDefined()
      expect(data.functionCall.name).toBe("listTasks")
      expect(data.functionCall.args).toBeDefined()
    })
  })

  describe("Task Context", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
    })

    it("should include user tasks in context", async () => {
      const tasks = [
        { id: "task-1", title: "Task 1", status: "todo", priority: "high" },
        { id: "task-2", title: "Task 2", status: "completed", priority: "low" },
      ]
      mockGetTasks.mockResolvedValue(tasks)

      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "I see your tasks" } }],
      })

      const request = await createRequest({
        message: "What tasks do I have?",
      })

      await POST(request)

      const calls = mockChatCreate.mock.calls
      expect(calls.length).toBeGreaterThan(0)

      const messages = calls[0][0].messages
      const contextMessage = messages.find(
        (m: any) => m.role === "assistant" && m.content.includes("USER'S EXISTING TASKS")
      )

      expect(contextMessage).toBeDefined()
      expect(contextMessage.content).toContain("Task 1")
      expect(contextMessage.content).toContain("Task 2")
    })

    it("should limit task context to 15 tasks", async () => {
      // Create 20 tasks
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i + 1}`,
        status: "todo",
        priority: "medium",
      }))
      mockGetTasks.mockResolvedValue(tasks)

      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "You have many tasks" } }],
      })

      const request = await createRequest({
        message: "List my tasks",
      })

      await POST(request)

      const calls = mockChatCreate.mock.calls
      const messages = calls[0][0].messages
      const contextMessage = messages.find(
        (m: any) => m.role === "assistant" && m.content.includes("USER'S EXISTING TASKS")
      )

      expect(contextMessage.content).toContain("and 5 more tasks")
    })

    it("should handle empty task list", async () => {
      mockGetTasks.mockResolvedValue([])

      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: "You have no tasks" } }],
      })

      const request = await createRequest({
        message: "What tasks do I have?",
      })

      await POST(request)

      const calls = mockChatCreate.mock.calls
      const messages = calls[0][0].messages
      const contextMessage = messages.find(
        (m: any) => m.role === "assistant" && m.content.includes("no tasks yet")
      )

      expect(contextMessage).toBeDefined()
    })
  })

  describe("Text-only Responses", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test User" },
      })
      mockGetTasks.mockResolvedValue([])
    })

    it("should return text response when no function is called", async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: "Hello! I'm your task management assistant.",
          },
        }],
      })

      const request = await createRequest({
        message: "Hi there!",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.message).toBe("Hello! I'm your task management assistant.")
      expect(data.functionCall).toBeUndefined()
    })

    it("should handle empty content from AI", async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      })

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe("")
    })
  })

  // A small helper: first Groq call returns the function_call, second returns text.
  const mockFunctionCall = (name: string, args: object, finalMessage = "Done!") => {
    mockChatCreate
      .mockResolvedValueOnce({
        choices: [{
          message: { content: null, function_call: { name, arguments: JSON.stringify(args) } },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: finalMessage } }],
      })
  }

  describe("Function Calling - Goals", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
    })

    it("should call createGoal with the provided args", async () => {
      const goal = { id: "goal-1", title: "Read 12 books" }
      mockCreateGoal.mockResolvedValue({ success: true, goal })
      mockFunctionCall(
        "createGoal",
        { title: "Read 12 books", progressType: "numeric", targetValue: 12 },
        "Created your goal.",
      )

      const response = await POST(await createRequest({ message: "Set a goal to read 12 books" }))
      const data = await response.json()

      expect(mockCreateGoal).toHaveBeenCalledWith({
        title: "Read 12 books",
        progressType: "numeric",
        targetValue: 12,
      })
      expect(data.functionCall?.name).toBe("createGoal")
      expect(data.functionCall?.result?.goal).toEqual(goal)

      // The action result must be marshaled back into the follow-up completion
      // as a function message the model reads to compose its reply.
      const followUp = mockChatCreate.mock.calls[1][0].messages
      const fnMsg = followUp.find((m: any) => m.role === "function")
      expect(fnMsg?.name).toBe("createGoal")
      expect(JSON.parse(fnMsg.content)).toEqual({ success: true, goal })
    })

    it("should marshal updateGoal into (id, args)", async () => {
      mockUpdateGoal.mockResolvedValue({ success: true, goal: { id: "goal-1" } })
      mockFunctionCall("updateGoal", { id: "goal-1", title: "New title" })

      await POST(await createRequest({ message: "Rename goal" }))

      expect(mockUpdateGoal).toHaveBeenCalledWith("goal-1", {
        id: "goal-1",
        title: "New title",
      })
    })

    it("should marshal adjustGoalProgress into (id, delta)", async () => {
      mockAdjustGoalProgress.mockResolvedValue({ success: true })
      mockFunctionCall("adjustGoalProgress", { id: "goal-1", delta: 3 })

      await POST(await createRequest({ message: "I read 3 more books" }))

      expect(mockAdjustGoalProgress).toHaveBeenCalledWith("goal-1", 3)
    })

    it("should marshal setGoalStatus into (id, status)", async () => {
      mockSetGoalStatus.mockResolvedValue({ success: true })
      mockFunctionCall("setGoalStatus", { id: "goal-1", status: "achieved" })

      await POST(await createRequest({ message: "Mark my goal achieved" }))

      expect(mockSetGoalStatus).toHaveBeenCalledWith("goal-1", "achieved")
    })

    it("should surface a goal action error to the follow-up", async () => {
      mockDeleteGoal.mockResolvedValue({ error: "Goal not found" })
      mockFunctionCall("deleteGoal", { id: "missing" })

      const response = await POST(await createRequest({ message: "Delete goal" }))
      const data = await response.json()

      expect(mockDeleteGoal).toHaveBeenCalledWith("missing")
      expect(data.functionCall?.result?.error).toBe("Goal not found")
    })

    it("should return a trimmed summary for listGoals", async () => {
      mockGetGoals.mockResolvedValue([
        {
          id: "goal-1",
          title: "Read 12 books",
          progressType: "numeric",
          targetValue: 12,
          currentValue: 6,
          manualProgress: 0,
          status: "active",
          targetDate: null,
        },
      ])
      mockFunctionCall("listGoals", {})

      const response = await POST(await createRequest({ message: "Show my goals" }))
      const data = await response.json()

      expect(data.functionCall?.name).toBe("listGoals")
      expect(data.functionCall?.result).toEqual([
        {
          id: "goal-1",
          title: "Read 12 books",
          percent: 50,
          status: "active",
          progressType: "numeric",
          targetDate: null,
        },
      ])
    })
  })

  describe("Function Calling - Habits", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
    })

    it("should call createHabit with the provided args", async () => {
      mockCreateHabit.mockResolvedValue({ success: true, habit: { id: "h-1", name: "Meditate" } })
      mockFunctionCall("createHabit", { name: "Meditate", goalType: "achieve" })

      await POST(await createRequest({ message: "Add a meditate habit" }))

      expect(mockCreateHabit).toHaveBeenCalledWith({ name: "Meditate", goalType: "achieve" })
    })

    it("should pass checkInHabit args through unchanged", async () => {
      mockCheckInHabit.mockResolvedValue({ success: true })
      mockFunctionCall("checkInHabit", { habitId: "h-1", delta: 1 })

      const response = await POST(await createRequest({ message: "I meditated today" }))
      const data = await response.json()

      expect(mockCheckInHabit).toHaveBeenCalledWith({ habitId: "h-1", delta: 1 })
      expect(data.functionCall?.result?.success).toBe(true)

      const followUp = mockChatCreate.mock.calls[1][0].messages
      const fnMsg = followUp.find((m: any) => m.role === "function")
      expect(fnMsg?.name).toBe("checkInHabit")
      expect(JSON.parse(fnMsg.content)).toEqual({ success: true })
    })

    it("should return a streak summary for listHabits", async () => {
      mockGetHabits.mockResolvedValue([
        {
          id: "h-1",
          name: "Meditate",
          frequencyType: "daily",
          weekdays: [],
          goalType: "achieve",
          targetAmount: 1,
          checkIns: [],
          createdAt: new Date(),
        },
      ])
      mockFunctionCall("listHabits", {})

      const response = await POST(await createRequest({ message: "How are my habits?" }))
      const data = await response.json()

      expect(data.functionCall?.name).toBe("listHabits")
      // A never-checked-in habit created today: 0 streak, not done, 0% this month.
      expect(data.functionCall?.result).toEqual([
        { id: "h-1", name: "Meditate", currentStreak: 0, todayDone: false, monthlyRate: 0 },
      ])
    })
  })

  describe("Function Calling - Reminders", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
    })

    it("should return due reminders with their task", async () => {
      const triggerAt = new Date("2026-07-04T09:00:00Z")
      mockGetDueReminders.mockResolvedValue([
        { id: "r-1", triggerAt, task: { id: "task-1", title: "Submit report" } },
      ])
      mockFunctionCall("listDueReminders", {})

      const response = await POST(await createRequest({ message: "What reminders are due?" }))
      const data = await response.json()

      expect(mockGetDueReminders).toHaveBeenCalled()
      expect(data.functionCall?.result).toEqual([
        { id: "r-1", taskId: "task-1", taskTitle: "Submit report", triggerAt: triggerAt.toISOString() },
      ])

      const followUp = mockChatCreate.mock.calls[1][0].messages
      const fnMsg = followUp.find((m: any) => m.role === "function")
      expect(fnMsg?.name).toBe("listDueReminders")
      expect(JSON.parse(fnMsg.content).reminders).toHaveLength(1)
    })
  })

  describe("Pillar Context", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
    })

    const contextMessage = () => {
      const messages = mockChatCreate.mock.calls[0][0].messages
      return messages.find(
        (m: any) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith("Current user context:"),
      )
    }

    it("should include goals in context", async () => {
      mockGetGoals.mockResolvedValue([
        {
          id: "goal-1",
          title: "Run a marathon",
          progressType: "manual",
          manualProgress: 40,
          currentValue: 0,
          status: "active",
          targetDate: null,
        },
      ])
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })

      await POST(await createRequest({ message: "hi" }))

      const ctx = contextMessage()
      expect(ctx.content).toContain("USER'S GOALS")
      expect(ctx.content).toContain("Run a marathon")
      expect(ctx.content).toContain("40% complete")
    })

    it("should include habits in context", async () => {
      mockGetHabits.mockResolvedValue([
        {
          id: "h-1",
          name: "Drink water",
          frequencyType: "daily",
          weekdays: [],
          goalType: "achieve",
          targetAmount: 1,
          checkIns: [],
          createdAt: new Date(),
        },
      ])
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })

      await POST(await createRequest({ message: "hi" }))

      const ctx = contextMessage()
      expect(ctx.content).toContain("USER'S HABITS")
      expect(ctx.content).toContain("Drink water")
    })

    it("should include due reminders in context", async () => {
      mockGetDueReminders.mockResolvedValue([
        { id: "r-1", triggerAt: new Date("2026-07-04T09:00:00Z"), task: { id: "t-1", title: "Call dentist" } },
      ])
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })

      await POST(await createRequest({ message: "hi" }))

      const ctx = contextMessage()
      expect(ctx.content).toContain("DUE REMINDERS")
      expect(ctx.content).toContain("Call dentist")
    })

    it("should omit pillar sections when everything is empty", async () => {
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })

      await POST(await createRequest({ message: "hi" }))

      const ctx = contextMessage()
      expect(ctx.content).not.toContain("USER'S GOALS")
      expect(ctx.content).not.toContain("USER'S HABITS")
      expect(ctx.content).not.toContain("DUE REMINDERS")
    })
  })
})
