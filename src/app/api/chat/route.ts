import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createTask, updateTask, deleteTask, getTasks } from "@/app/actions/tasks"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "",
  baseURL: "https://api.groq.com/openai/v1"
})

// Function calling schema for task operations
const functions = [
  {
    name: "createTask",
    description: "Create a new task with a title, optional description, priority level, and due date",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title/name of the task"
        },
        description: {
          type: "string",
          description: "Optional detailed description of the task"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level of the task"
        },
        dueDate: {
          type: "string",
          description: "Due date in ISO 8601 format (e.g., 2024-12-31)"
        }
      },
      required: ["title"]
    }
  },
  {
    name: "updateTask",
    description: "Update an existing task's properties",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the task to update"
        },
        title: {
          type: "string",
          description: "New title for the task"
        },
        description: {
          type: "string",
          description: "New description for the task"
        },
        status: {
          type: "string",
          enum: ["todo", "in-progress", "completed"],
          description: "New status for the task"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "New priority level for the task"
        },
        dueDate: {
          type: "string",
          description: "New due date in ISO 8601 format"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "deleteTask",
    description: "Delete a task by its ID",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the task to delete"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "listTasks",
    description: "Get all tasks for the current user",
    parameters: {
      type: "object",
      properties: {}
    }
  }
]

const systemPrompt = `You are a helpful task management assistant for FocusFlow. You can help users:
- Create tasks with title, description, priority, and due dates
- Update existing tasks (change status, priority, title, description, due dates)
- Delete tasks
- List and organize tasks

When users ask for help, extract the task details and call the appropriate function.
Be conversational and friendly. For destructive operations like deleting, confirm the action by showing what will be deleted.

IMPORTANT - Task Identification:
- Tasks are shown as "Task #X: <full_id>" in the context
- When updating or deleting, you MUST use the FULL task ID (the long string), NOT the task number
- Copy the FULL task ID exactly as shown in the context

Guidelines:
- Keep responses concise and helpful
- When creating tasks, confirm what was created
- When updating tasks, mention what changed
- When listing tasks, format them clearly with status and priority
- If a user references "that task" or similar, ask for clarification about which task
- Always use the FULL task ID (not the number) when updating/deleting specific tasks
- Be proactive in suggesting relevant actions`

export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, history = [] } = await req.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({
        error: "AI service not configured",
        message: "Please contact the administrator to set up the AI service."
      }, { status: 500 })
    }

    // Get user's tasks for context
    const userTasks = await getTasks(session.user.id)

    // Build context message with task information
    const taskContext = userTasks.length > 0
      ? `\n\nUser's current tasks (${userTasks.length}):\n${userTasks.slice(0, 10).map((t, index) =>
          `- [Task #${index + 1}: ${t.id}] ${t.title} (Status: ${t.status}, Priority: ${t.priority})`
        ).join("\n")}${userTasks.length > 10 ? `\n... and ${userTasks.length - 10} more tasks` : ""}
\n\nIMPORTANT: When updating or deleting tasks, use the FULL task ID (the string after "Task #X:"), not the task number.`
      : "\n\nUser has no tasks yet."

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: `Current user context:${taskContext}` },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      })),
      { role: "user", content: message }
    ]

    // Call Groq API with function calling
    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      functions,
      function_call: "auto",
      temperature: 0.7,
      max_tokens: 500
    })

    const choice = response.choices[0]
    const messageContent = choice.message?.content || ""

    // Check if AI wants to call a function
    if (choice.message?.function_call) {
      const functionCall = choice.message.function_call
      const functionName = functionCall.name
      let functionArgs: Record<string, any> = {}

      try {
        functionArgs = JSON.parse(functionCall.arguments || "{}")
      } catch (e) {
        return NextResponse.json({
          message: "I had trouble understanding that request. Could you rephrase it?"
        })
      }

      // Execute the function
      let result
      let followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messages,
        choice.message
      ]

      switch (functionName) {
        case "createTask":
          result = await createTask(functionArgs as any)
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error })
            })
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ success: true, task: result.task })
            })
          }
          break

        case "updateTask":
          result = await updateTask(functionArgs.id as string, functionArgs as any)
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error })
            })
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ success: true, task: result.task })
            })
          }
          break

        case "deleteTask":
          console.log("[Chat API] Delete task called with ID:", functionArgs.id)
          result = await deleteTask(functionArgs.id as string)
          console.log("[Chat API] Delete result:", result)
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error })
            })
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ success: true, message: "Task deleted successfully" })
            })
          }
          break

        case "listTasks":
          const tasks = await getTasks(session.user.id)
          followUpMessages.push({
            role: "function",
            name: functionName,
            content: JSON.stringify({ tasks })
          })
          break

        default:
          return NextResponse.json({
            message: "I'm not sure how to help with that request."
          })
      }

      // Get final response from AI with function results
      const finalResponse = await openai.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: followUpMessages,
        temperature: 0.7,
        max_tokens: 500
      })

      const finalMessage = finalResponse.choices[0]?.message?.content || "Done!"

      return NextResponse.json({
        message: finalMessage,
        functionCall: {
          name: functionName,
          args: functionArgs,
          result: result
        }
      })
    }

    // No function call, just return the text response
    return NextResponse.json({
      message: messageContent
    })

  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json({
      error: "Failed to process chat message",
      message: "Sorry, something went wrong. Please try again."
    }, { status: 500 })
  }
}
