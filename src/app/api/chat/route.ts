import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTask,
  updateTask,
  deleteTask,
  getTasks,
} from "@/app/actions/tasks";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "",
  baseURL: "https://api.groq.com/openai/v1",
});

// Function calling schema for task operations
const functions = [
  {
    name: "createTask",
    description:
      "Create a new task with a title, optional description, priority level, and due date",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title/name of the task",
        },
        description: {
          type: "string",
          description: "Optional detailed description of the task. IMPORTANT: Preserve all markdown formatting including bullet points (-), lists, headers (#), etc. Copy the description exactly as provided by the user without converting to plain text.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level of the task",
        },
        dueDate: {
          type: "string",
          description: "Due date in ISO 8601 format (e.g., 2024-12-31)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "updateTask",
    description: "Update an existing task's properties",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the task to update",
        },
        title: {
          type: "string",
          description: "New title for the task",
        },
        description: {
          type: "string",
          description: "New description for the task. IMPORTANT: Preserve all markdown formatting including bullet points (-), lists, headers (#), etc.",
        },
        status: {
          type: "string",
          enum: ["todo", "in-progress", "completed"],
          description: "New status for the task",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "New priority level for the task",
        },
        dueDate: {
          type: "string",
          description: "New due date in ISO 8601 format",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteTask",
    description: "Delete a task by its ID",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the task to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "listTasks",
    description: "Get all tasks for the current user",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

const systemPrompt = `You are a helpful task management assistant for FocusFlow. You can help users:
- Create tasks with title, description, priority, and due dates
- Update existing tasks (change status, priority, title, description, due dates)
- Delete tasks
- List and organize tasks

When users ask for help, extract the task details and call the appropriate function.
Be conversational and friendly. For destructive operations like deleting, confirm the action by showing what will be deleted.

CRITICAL - Task Identification for Updates/Deletes:
- Users typically reference tasks by TITLE, not by ID
- When a user says "change task", "update task", "for task", "modify task", or uses verbs like "change", "update", "modify", "set", "add due", "set priority" - they want to UPDATE an existing task
- NEVER use createTask when the user wants to modify an existing task
- Look at the task list below and find the task whose TITLE matches what the user said
- Once you find the correct task by title, use its FULL ID for the updateTask function
- The ID format shown is: [Title] (ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

KEYWORDS THAT MEAN UPDATE (NOT CREATE):
- "change task X", "update task X", "modify task X"
- "for task X, add/change/set..."
- "set task X due to...", "change task X priority to..."
- "mark task X as completed/in-progress"

KEYWORDS THAT MEAN CREATE:
- "create a new task", "add a task", "make a task"
- "I need to...", "Remind me to..." (when no existing task is mentioned)

Examples:
- "change task Create new DI for OMI EPN due to 6 februari 2026" → UPDATE existing task, NOT create
- "for task Prepare for create new DI, add due to 8 februari 2026" → UPDATE existing task, NOT create
- "update task Buy groceries to high priority" → UPDATE existing task, NOT create
- "create a task called Buy milk" → CREATE new task (this one doesn't exist yet)

CRITICAL - Preserve Markdown Formatting in Descriptions:
- When users provide a description with lists (using -, *, or bullets), headers, or any markdown formatting
- You MUST preserve the exact markdown format in the description parameter
- Do NOT convert lists to plain text - keep the "-" bullet points
- Do NOT add any additional formatting or explanations within the description
- Copy the description EXACTLY as the user provides it

Guidelines:
- Keep responses concise and helpful
- When creating tasks, confirm what was created
- When updating tasks, mention what changed
- When listing tasks, format them clearly with status and priority
- If a user references "that task" or similar, ask for clarification about which task
- Be proactive in suggesting relevant actions`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, history = [] } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error: "AI service not configured",
          message: "Please contact the administrator to set up the AI service.",
        },
        { status: 500 },
      );
    }

    // Get user's tasks for context
    const userTasks = await getTasks(session.user.id);

    // Build context message with task information
    const taskContext =
      userTasks.length > 0
        ? `\n\n===== USER'S EXISTING TASKS =====\n${userTasks
            .slice(0, 15)
            .map(
              (t) =>
                `• "${t.title}" (ID: ${t.id}, Status: ${t.status}, Priority: ${t.priority})`,
            )
            .join("\n")}${userTasks.length > 15 ? `\n... and ${userTasks.length - 15} more tasks` : ""}

IMPORTANT: When updating a task, find the task by its TITLE in the list above, then use its ID (the long string after "ID:").`
        : "\n\nUser has no tasks yet.";

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: `Current user context:${taskContext}` },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    // Call Groq API with function calling
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      functions,
      function_call: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const choice = response.choices[0];
    const messageContent = choice.message?.content || "";

    // Check if AI wants to call a function
    if (choice.message?.function_call) {
      const functionCall = choice.message.function_call;
      const functionName = functionCall.name;
      let functionArgs: Record<string, any> = {};

      try {
        functionArgs = JSON.parse(functionCall.arguments || "{}");
      } catch (e) {
        return NextResponse.json({
          message:
            "I had trouble understanding that request. Could you rephrase it?",
        });
      }

      // Execute the function
      let result;
      let followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [...messages, choice.message];

      switch (functionName) {
        case "createTask":
          result = await createTask(functionArgs as any);
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error }),
            });
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ success: true, task: result.task }),
            });
          }
          break;

        case "updateTask":
          result = await updateTask(
            functionArgs.id as string,
            functionArgs as any,
          );
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error }),
            });
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ success: true, task: result.task }),
            });
          }
          break;

        case "deleteTask":
          console.log(
            "[Chat API] Delete task called with ID:",
            functionArgs.id,
          );
          result = await deleteTask(functionArgs.id as string);
          console.log("[Chat API] Delete result:", result);
          if (result.error) {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({ error: result.error }),
            });
          } else {
            followUpMessages.push({
              role: "function",
              name: functionName,
              content: JSON.stringify({
                success: true,
                message: "Task deleted successfully",
              }),
            });
          }
          break;

        case "listTasks":
          const tasks = await getTasks(session.user.id);
          followUpMessages.push({
            role: "function",
            name: functionName,
            content: JSON.stringify({ tasks }),
          });
          break;

        default:
          return NextResponse.json({
            message: "I'm not sure how to help with that request.",
          });
      }

      // Get final response from AI with function results
      const finalResponse = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: followUpMessages,
        temperature: 0.3,
        max_tokens: 1024,
      });

      const finalMessage =
        finalResponse.choices[0]?.message?.content || "Done!";

      return NextResponse.json({
        message: finalMessage,
        functionCall: {
          name: functionName,
          args: functionArgs,
          result: result,
        },
      });
    }

    // No function call, just return the text response
    return NextResponse.json({
      message: messageContent,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: "Failed to process chat message",
        message: "Sorry, something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }
}
