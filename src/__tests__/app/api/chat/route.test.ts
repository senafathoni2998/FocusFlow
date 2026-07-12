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

// Mock settings (provider preference lookup). Null => resolve via env/groq default.
const mockGetUserAIProviderPref = jest.fn()
jest.mock("@/app/actions/settings", () => ({
  getUserAIProviderPref: (...args: any[]) => mockGetUserAIProviderPref(...args),
}))

// Mock auth
const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({
  auth: (...args: any[]) => mockAuth(...args),
}))

// Import route after mocks are set up
import { POST } from "@/app/api/chat/route"
// Source of truth for the task enums — the tool schema must stay in sync with it.
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/taskConstants"

// Helper to create a mock request
const createRequest = async (body: any): Promise<any> => {
  return {
    json: async () => body,
  }
}

describe("Chat API Route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Deterministic provider resolution: groq is the only configured provider, so
    // clear any other provider env that the real .env / shell might have set.
    for (const k of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "DEEPSEEK_API_KEY",
      "GEMINI_API_KEY",
      "AI_PROVIDER",
      "GROQ_MODEL",
      "OPENAI_MODEL",
    ]) {
      delete process.env[k]
    }
    process.env.GROQ_API_KEY = "test-api-key"
    // The route fetches all four pillars for context on every request — default
    // the new pillar getters so the Promise.all always resolves cleanly.
    mockGetGoals.mockResolvedValue([])
    mockGetHabits.mockResolvedValue([])
    mockGetDueReminders.mockResolvedValue([])
    // No stored provider preference by default → resolves to the groq default.
    mockGetUserAIProviderPref.mockResolvedValue(null)
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

    it("should return 500 when no AI provider is configured", async () => {
      // Clear every provider key so no provider resolves.
      for (const k of [
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "DEEPSEEK_API_KEY",
        "GEMINI_API_KEY",
      ]) {
        delete process.env[k]
      }

      const request = await createRequest({
        message: "Hello",
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("AI service not configured")
      expect(data.message).toContain("No AI provider is configured")
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "createTask",
                arguments: JSON.stringify({
                  title: "New Task",
                  description: "Test description",
                  priority: "high",
                }),
              } }],
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

    it("should marshal a createTask tags array through to the action", async () => {
      const newTask = { id: "task-9", title: "Pay rent" }
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "createTask",
                arguments: JSON.stringify({ title: "Pay rent", tags: ["home", "bills"] }),
              } }],
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: "Created 'Pay rent'." } }],
        })
      mockCreateTask.mockResolvedValue({ task: newTask })

      const response = await POST(await createRequest({ message: "add Pay rent #home #bills" }))
      await response.json()

      expect(mockCreateTask).toHaveBeenCalledWith({
        title: "Pay rent",
        tags: ["home", "bills"],
      })
    })

    it("should handle createTask errors gracefully", async () => {
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "createTask",
                arguments: JSON.stringify({ title: "New Task" }),
              } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "updateTask",
                arguments: JSON.stringify({
                  id: "task-123",
                  status: "completed",
                  priority: "high",
                }),
              } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "updateTask",
                arguments: JSON.stringify({
                  id: "task-123",
                  status: "completed",
                }),
              } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "deleteTask",
                arguments: JSON.stringify({ id: "task-123" }),
              } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "deleteTask",
                arguments: JSON.stringify({ id: "task-123" }),
              } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "listTasks",
                arguments: "{}",
              } }],
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
            tool_calls: [{ id: "call_1", type: "function", function: {
              name: "createTask",
              arguments: "invalid json{{{",
            } }],
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
            tool_calls: [{ id: "call_1", type: "function", function: {
              name: "unknownFunction",
              arguments: "{}",
            } }],
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
              tool_calls: [{ id: "call_1", type: "function", function: {
                name: "listTasks",
                arguments: "{}",
              } }],
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
        (m: any) => m.role === "system" && m.content.includes("USER'S EXISTING TASKS")
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
        (m: any) => m.role === "system" && m.content.includes("USER'S EXISTING TASKS")
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
        (m: any) => m.role === "system" && m.content.includes("no tasks yet")
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
          message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] },
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
      const fnMsg = followUp.find((m: any) => m.role === "tool")
      expect(fnMsg?.tool_call_id).toBe("call_1")
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
      const fnMsg = followUp.find((m: any) => m.role === "tool")
      expect(fnMsg?.tool_call_id).toBe("call_1")
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
      // A never-checked-in daily habit created today: 0 streak, not done, 0% month.
      expect(data.functionCall?.result).toEqual([
        { id: "h-1", name: "Meditate", currentStreak: 0, streakUnit: "day", todayDone: false, monthlyRate: 0 },
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
      const fnMsg = followUp.find((m: any) => m.role === "tool")
      expect(fnMsg?.tool_call_id).toBe("call_1")
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
        (m: any) => m.role === "system" && typeof m.content === "string" && m.content.includes("Current user context:"),
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

  describe("Provider + tools request shape", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
    })

    it("sends the modern tools/tool_choice params, not legacy functions", async () => {
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "hi" } }] })

      await POST(await createRequest({ message: "hi" }))

      const firstCall = mockChatCreate.mock.calls[0][0]
      expect(firstCall.tool_choice).toBe("auto")
      expect(Array.isArray(firstCall.tools)).toBe(true)
      expect(firstCall.tools[0]).toEqual(
        expect.objectContaining({
          type: "function",
          function: expect.objectContaining({ name: expect.any(String) }),
        }),
      )
      expect(firstCall).not.toHaveProperty("functions")
      expect(firstCall).not.toHaveProperty("function_call")
    })

    it("uses the model of the user's chosen provider", async () => {
      mockGetUserAIProviderPref.mockResolvedValue("openai")
      process.env.OPENAI_API_KEY = "sk-openai"
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "hi" } }] })

      await POST(await createRequest({ message: "hi" }))

      expect(mockChatCreate.mock.calls[0][0].model).toBe("gpt-4o-mini")
    })

    it("returns 500 when the resolved provider has no key even if a preference is stored", async () => {
      mockGetUserAIProviderPref.mockResolvedValue("openai") // stored but no OPENAI key
      delete process.env.GROQ_API_KEY // and no fallback either

      const response = await POST(await createRequest({ message: "hi" }))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("AI service not configured")
    })

    it("places the trimmed assistant tool_calls message right before the tool result", async () => {
      mockCreateGoal.mockResolvedValue({ success: true, goal: { id: "g1" } })
      mockFunctionCall("createGoal", { title: "X" })

      await POST(await createRequest({ message: "make a goal" }))

      const followUp = mockChatCreate.mock.calls[1][0].messages
      const asstIdx = followUp.findIndex(
        (m: any) => m.role === "assistant" && Array.isArray(m.tool_calls),
      )
      const toolIdx = followUp.findIndex((m: any) => m.role === "tool")
      expect(asstIdx).toBeGreaterThanOrEqual(0)
      expect(followUp[asstIdx].tool_calls).toHaveLength(1)
      expect(followUp[asstIdx].tool_calls[0].id).toBe("call_1")
      // the assistant tool_calls message immediately precedes its tool result
      expect(toolIdx).toBe(asstIdx + 1)
    })

    it("handles only the first tool call when the model returns several", async () => {
      mockCreateGoal.mockResolvedValue({ success: true, goal: { id: "g1" } })
      mockChatCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "createGoal", arguments: JSON.stringify({ title: "A" }) } },
                { id: "call_2", type: "function", function: { name: "createHabit", arguments: JSON.stringify({ name: "B" }) } },
              ],
            },
          }],
        })
        .mockResolvedValueOnce({ choices: [{ message: { content: "done" } }] })

      const response = await POST(await createRequest({ message: "do two things" }))
      const data = await response.json()

      // Only the first tool call runs; the assistant message is trimmed to one.
      expect(mockCreateGoal).toHaveBeenCalledTimes(1)
      expect(mockCreateHabit).not.toHaveBeenCalled()
      expect(data.functionCall?.name).toBe("createGoal")

      const followUp = mockChatCreate.mock.calls[1][0].messages
      const asst = followUp.find((m: any) => m.role === "assistant" && Array.isArray(m.tool_calls))
      expect(asst.tool_calls).toHaveLength(1)
      const toolMsgs = followUp.filter((m: any) => m.role === "tool")
      expect(toolMsgs).toHaveLength(1)
      expect(toolMsgs[0].tool_call_id).toBe("call_1")
    })
  })

  // Locks the fix for editing tasks via the AI: the updateTask tool must expose
  // the full status/priority value sets, and the system prompt must steer the
  // model toward partial updates that never clobber the (unshown) description.
  describe("Edit-task tool schema + prompt", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([])
      mockChatCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })
    })

    const sentTools = () => mockChatCreate.mock.calls[0][0].tools
    const toolNamed = (name: string) =>
      sentTools().find((t: any) => t.function?.name === name)?.function
    const systemContent = () => {
      const messages = mockChatCreate.mock.calls[0][0].messages
      return messages.find((m: any) => m.role === "system").content as string
    }

    it("keeps updateTask's status enum in sync with TASK_STATUSES (incl. wont-do)", async () => {
      await POST(await createRequest({ message: "hi" }))
      // Tie to the source of truth so a future status added to taskConstants
      // can't silently drift the tool schema out of parity.
      expect(toolNamed("updateTask").parameters.properties.status.enum).toEqual([
        ...TASK_STATUSES,
      ])
    })

    it("keeps create/update priority enums in sync with TASK_PRIORITIES (incl. none)", async () => {
      await POST(await createRequest({ message: "hi" }))
      expect(toolNamed("createTask").parameters.properties.priority.enum).toEqual([
        ...TASK_PRIORITIES,
      ])
      expect(toolNamed("updateTask").parameters.properties.priority.enum).toEqual([
        ...TASK_PRIORITIES,
      ])
    })

    it("does not force description on an edit (updateTask requires only id)", async () => {
      await POST(await createRequest({ message: "hi" }))
      // If a field like description/status were ever added to `required`, every
      // edit would be forced to carry it and reintroduce the clobber by construction.
      expect(toolNamed("updateTask").parameters.required).toEqual(["id"])
      expect(toolNamed("createTask").parameters.required).toEqual(["title"])
    })

    it("exposes a tags array on createTask so the assistant can parse #tags", async () => {
      await POST(await createRequest({ message: "hi" }))
      const tags = toolNamed("createTask").parameters.properties.tags
      expect(tags?.type).toBe("array")
      expect(tags?.items?.type).toBe("string")
    })

    it("marks updateTask as a partial update and warns against clobbering the description", async () => {
      await POST(await createRequest({ message: "hi" }))
      const update = toolNamed("updateTask")
      expect(update.description).toMatch(/partial update/i)
      // The description param must warn that sending it replaces/erases existing notes.
      expect(update.parameters.properties.description.description).toMatch(
        /ERASES|REPLACES/,
      )
    })

    it("system prompt instructs partial edits and forbids description clobbering", async () => {
      await POST(await createRequest({ message: "hi" }))
      const sys = systemContent()
      expect(sys).toMatch(/PARTIAL update/i)
      expect(sys).toMatch(/NEVER include "description" on an update/i)
      // Falls back to listTasks instead of creating a duplicate when unresolved.
      expect(sys).toMatch(/call listTasks/i)
      expect(sys).toMatch(/NEVER create a new task as a substitute/i)
    })
  })

  // End-to-end marshaling: proves the edit path (not just the wording) protects
  // the description and honors the documented clear/wont-do semantics. These pin
  // behavior at the route boundary where the original clobber occurred.
  describe("Edit-task marshaling (partial update)", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-123", name: "Test User" } })
      mockGetTasks.mockResolvedValue([
        { id: "task-123", title: "Existing Task", status: "todo", priority: "medium" },
      ])
      mockUpdateTask.mockResolvedValue({ success: true, task: { id: "task-123" } })
    })

    it("drops an empty-string description so an edit can't blank the user's notes", async () => {
      mockFunctionCall("updateTask", { id: "task-123", status: "completed", description: "" })

      await POST(await createRequest({ message: "mark Existing Task done" }))

      expect(mockUpdateTask).toHaveBeenCalledTimes(1)
      const args = mockUpdateTask.mock.calls[0][1]
      expect(args).not.toHaveProperty("description")
      expect(args.status).toBe("completed")
    })

    it("drops a whitespace-only description too", async () => {
      mockFunctionCall("updateTask", { id: "task-123", dueDate: "2026-02-08", description: "   " })

      await POST(await createRequest({ message: "set the due date" }))

      expect(mockUpdateTask.mock.calls[0][1]).not.toHaveProperty("description")
    })

    it("keeps a real description the user actually provided", async () => {
      mockFunctionCall("updateTask", { id: "task-123", description: "- a\n- b" })

      await POST(await createRequest({ message: "set the notes to a list" }))

      expect(mockUpdateTask.mock.calls[0][1].description).toBe("- a\n- b")
    })

    it("passes an empty-string dueDate through as an explicit clear (no description leaked in)", async () => {
      mockFunctionCall("updateTask", { id: "task-123", dueDate: "" })

      await POST(await createRequest({ message: "remove the due date on Existing Task" }))

      const args = mockUpdateTask.mock.calls[0][1]
      expect(args.dueDate).toBe("")
      expect(args).not.toHaveProperty("description")
    })

    it("marshals a wont-do status edit through to updateTask", async () => {
      mockFunctionCall("updateTask", { id: "task-123", status: "wont-do" })

      await POST(await createRequest({ message: "skip Existing Task" }))

      expect(mockUpdateTask).toHaveBeenCalledWith("task-123", {
        id: "task-123",
        status: "wont-do",
      })
    })
  })
})
