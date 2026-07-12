import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTask,
  updateTask,
  deleteTask,
  getTasks,
} from "@/app/actions/tasks";
import {
  getGoals,
  createGoal,
  updateGoal,
  adjustGoalProgress,
  setGoalStatus,
  deleteGoal,
} from "@/app/actions/goals";
import {
  getHabits,
  createHabit,
  checkInHabit,
  deleteHabit,
} from "@/app/actions/habits";
import { getDueReminders } from "@/app/actions/reminders";
import { getUserAIProviderPref } from "@/app/actions/settings";
import { getAIClient } from "@/lib/aiProviders";
import { computeHabitStats } from "@/lib/habitStats";
import { goalPercent } from "@/lib/goalStats";
import type { Goal } from "@/types/goal";
import type { Habit } from "@/types/habit";
import OpenAI from "openai";

// The AI client is resolved per-request from the user's chosen provider
// (getAIClient), so there's no module-level client anymore.

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
          enum: ["none", "low", "medium", "high"],
          description:
            "Priority level of the task (defaults to medium if omitted; 'none' means no priority)",
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
    description:
      "Update an existing task. This is a PARTIAL update: pass the task's id plus ONLY the field(s) the user explicitly asked to change. Every field you omit is left exactly as it is — do NOT re-send unchanged fields.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The ID of the task to update",
        },
        title: {
          type: "string",
          description:
            "New title for the task. Only include this when the user is renaming the task.",
        },
        description: {
          type: "string",
          description:
            "New description text. Include this ONLY when the user explicitly provides new description content. You are NOT shown the task's current description, and this field REPLACES the whole description, so sending a guessed, summarized, or empty value here ERASES the user's existing notes. When you do set it, preserve the user's exact markdown: bullet points (-), lists, headers (#), etc.",
        },
        status: {
          type: "string",
          enum: ["todo", "in-progress", "completed", "wont-do"],
          description:
            "New status for the task. 'wont-do' means abandoned/skipped (still counts as closed/done).",
        },
        priority: {
          type: "string",
          enum: ["none", "low", "medium", "high"],
          description: "New priority level for the task ('none' clears the priority)",
        },
        dueDate: {
          type: "string",
          description:
            "New due date in ISO 8601 format (YYYY-MM-DD). Pass an empty string to remove the due date.",
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
  // ---- Goals ----
  {
    name: "createGoal",
    description:
      "Create a new goal. Progress can be tracked manually (a self-reported 0-100%), numerically (a current value toward a target, e.g. read 12 books), or derived from linked tasks.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The goal's title" },
        description: {
          type: "string",
          description: "Optional details/notes for the goal",
        },
        progressType: {
          type: "string",
          enum: ["manual", "numeric", "tasks"],
          description:
            "How progress is measured. Use 'numeric' when there is a target number, 'manual' for a self-reported percentage, 'tasks' to derive progress from linked tasks.",
        },
        targetValue: {
          type: "number",
          description:
            "Target amount for a 'numeric' goal (e.g. 12 for 'read 12 books'). Required for numeric goals or progress reads 0%.",
        },
        unit: {
          type: "string",
          description: "Unit for a numeric goal (e.g. 'books', 'km')",
        },
        targetDate: {
          type: "string",
          description: "Optional deadline in ISO 8601 date format (YYYY-MM-DD)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "updateGoal",
    description:
      "Update a goal's details (title, description, progress type, target value/unit, deadline). Do NOT use this to change progress or status — use adjustGoalProgress or setGoalStatus for those.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the goal to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description/notes" },
        progressType: {
          type: "string",
          enum: ["manual", "numeric", "tasks"],
        },
        targetValue: {
          type: "number",
          description: "New target amount (numeric goals)",
        },
        unit: { type: "string", description: "New unit (numeric goals)" },
        targetDate: {
          type: "string",
          description: "New deadline in ISO 8601 (YYYY-MM-DD)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "adjustGoalProgress",
    description:
      "Nudge a goal's progress by a delta. For numeric goals this moves the current value (e.g. +3 books); for manual goals it moves the percentage (e.g. +10). Use a negative delta to decrease. Has no effect on 'tasks' goals — their progress comes from completing linked tasks.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the goal" },
        delta: {
          type: "number",
          description: "Amount to add (use a negative number to subtract)",
        },
      },
      required: ["id", "delta"],
    },
  },
  {
    name: "setGoalStatus",
    description:
      "Change a goal's status: mark it achieved, archive it, or reactivate it (set back to active).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the goal" },
        status: {
          type: "string",
          enum: ["active", "achieved", "archived"],
          description: "The new status",
        },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "deleteGoal",
    description:
      "Delete a goal by its ID. Any linked tasks are kept but unlinked from the goal.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the goal to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "listGoals",
    description:
      "Get the user's active and achieved goals with their current progress percentage.",
    parameters: { type: "object", properties: {} },
  },
  // ---- Habits ----
  {
    name: "createHabit",
    description:
      "Create a new daily habit. An 'achieve' habit is a simple daily check (done / not done); an 'amount' habit tracks a numeric target per day (e.g. drink 8 glasses of water).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The habit's name" },
        goalType: {
          type: "string",
          enum: ["achieve", "amount"],
          description:
            "'achieve' for a simple daily done/not-done, 'amount' for a per-day numeric target",
        },
        targetAmount: {
          type: "number",
          description: "Daily target for an 'amount' habit (e.g. 8)",
        },
        unit: {
          type: "string",
          description: "Unit for an 'amount' habit (e.g. 'glasses')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "checkInHabit",
    description:
      "Log (check in) a habit for a day. Default is today with delta +1 (marks an 'achieve' habit done, or adds 1 to an 'amount' habit). Use a negative delta to undo a check-in. Optionally pass a specific date.",
    parameters: {
      type: "object",
      properties: {
        habitId: {
          type: "string",
          description: "The ID of the habit to check in",
        },
        delta: {
          type: "number",
          description: "Amount to add for the day (default 1; negative to undo)",
        },
        date: {
          type: "string",
          description:
            "The day to check in, ISO 8601 (YYYY-MM-DD). Defaults to today.",
        },
      },
      required: ["habitId"],
    },
  },
  {
    name: "listHabits",
    description:
      "Get the user's habits with their current streak, whether today is done, and this month's completion rate.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "deleteHabit",
    description: "Delete a habit (and its check-in history) by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the habit to delete" },
      },
      required: ["id"],
    },
  },
  // ---- Reminders (read-only) ----
  {
    name: "listDueReminders",
    description:
      "List the user's reminders that are currently due (their trigger time has passed and they haven't been dispatched yet), along with the task each is attached to. Reminders can only be set on a task in the app — you cannot create them.",
    parameters: { type: "object", properties: {} },
  },
];

// Wrap the function definitions in the modern `tools` shape. Unlike the legacy
// `functions`/`function_call` params, `tools`/`tool_calls` is accepted by every
// provider's OpenAI-compatible endpoint (OpenAI, Groq, DeepSeek, Gemini, Claude).
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = functions.map(
  (fn) => ({ type: "function", function: fn }),
);

// Format a Date as YYYY-MM-DD in the server's local time — the same basis
// createTask uses to store all-day dates, so displayed/parsed dates stay aligned.
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A goal's targetDate is a calendar-day deadline stored at UTC midnight, so we
// format it with UTC getters to round-trip the exact day the user picked (the
// same convention goalStats/toTargetDate use) — local getters would shift it a
// day in negative-offset zones.
function formatUTCDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// A reminder's triggerAt is a real instant (the local time the user picked), so a
// human-friendly local date+time is the right way to show it.
function formatReminderTime(d: Date): string {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const systemPrompt = `You are a helpful productivity assistant for FocusFlow. FocusFlow tracks four pillars: TASKS, GOALS, HABITS, and REMINDERS. You can help users:
- Tasks: create, update (status incl. "won't do", priority incl. "none", title, description, due date), delete, and list tasks
- Goals: create goals, edit their details, nudge their progress, mark them achieved/archived/active, delete, and list goals
- Habits: create daily habits, check in (log) a habit for a day, delete, and list habits with their streaks
- Reminders: list reminders that are currently due (reminders are attached to tasks and can only be set on a task in the app — you cannot create them here)

When users ask for help, extract the details and call the appropriate function.
Be conversational and friendly. For destructive operations like deleting, confirm the action by showing what will be deleted.

CRITICAL - Task Identification for Updates/Deletes:
- Users typically reference tasks by TITLE, not by ID
- When a user says "change task", "update task", "for task", "modify task", or uses verbs like "change", "update", "modify", "set", "add due", "set priority" - they want to UPDATE an existing task
- NEVER use createTask when the user wants to modify an existing task
- Look at the task list below and find the task whose TITLE matches what the user said
- Once you find the correct task by title, use its FULL ID for the updateTask function
- Each task is listed below as: "Title" (ID: <id>, Status: ..., Priority: ...[, Due: ...]) — use the value right after "ID:" up to the comma.
- If the task the user named is NOT in the list below (they may have more tasks than are shown here), call listTasks to load the full list, find the match, then updateTask with its ID. NEVER create a new task as a substitute for an edit you could not resolve — if it is still not found, ask the user which task they mean.

KEYWORDS THAT MEAN UPDATE (NOT CREATE):
- "change task X", "update task X", "modify task X"
- "for task X, add/change/set..."
- "set task X due to...", "change task X priority to...", "clear task X due date", "remove priority from task X"
- "mark task X as completed/in-progress", "mark task X as won't do", "skip task X"

KEYWORDS THAT MEAN CREATE:
- "create a new task", "add a task", "make a task"
- "I need to...", "Remind me to..." (when no existing task is mentioned)

Examples (on an update, send ONLY the field being changed, plus id):
- "change task Create new DI for OMI EPN due to 6 februari 2026" → updateTask { id, dueDate: "2026-02-06" } (UPDATE, NOT create)
- "for task Prepare for create new DI, add due to 8 februari 2026" → updateTask { id, dueDate: "2026-02-08" } (UPDATE, NOT create)
- "update task Buy groceries to high priority" → updateTask { id, priority: "high" } (UPDATE, NOT create)
- "mark task Buy groceries as won't do" → updateTask { id, status: "wont-do" }
- "create a task called Buy milk" → createTask { title: "Buy milk" } (CREATE — this one doesn't exist yet)

CRITICAL - An edit changes ONLY the field the user named:
- updateTask is a PARTIAL update. Pass the task id plus ONLY the field(s) the user explicitly asked to change; every field you omit keeps its current value. Do NOT re-send unchanged fields "to be safe" — that overwrites them.
- NEVER include "description" on an update unless the user is explicitly giving you NEW description text. You are not shown the task's current description, so sending anything there (a guess, a summary, or an empty string) DELETES the notes the user already has. A due-date / priority / status / title change must NOT touch the description.
- To clear a due date, pass dueDate as an empty string "". To remove a priority, set priority "none". To abandon/skip a task, set status "wont-do".
- You can only set a task's title, description, status, priority, and due date here. If the user asks to change a task's tags, list/project, linked goal, repeat/recurrence, subtasks, or reminders, tell them those are managed on the task in the app — do NOT attempt it with updateTask and do NOT create a new task for it.

CRITICAL - Preserve Markdown Formatting in Descriptions:
- This applies ONLY when the user actually GIVES you description text — when creating a task, or when they explicitly ask to change the description. It is NOT a reason to attach a description to an edit that is not about the description (see the rule above).
- In that case you MUST preserve the exact markdown format in the description parameter
- Do NOT convert lists to plain text - keep the "-" bullet points
- Do NOT add any additional formatting or explanations within the description
- Copy the description EXACTLY as the user provides it

CRITICAL - Identifying Goals & Habits (same as tasks: reference by title/name, act by ID):
- Users reference GOALS by their TITLE and HABITS by their NAME, not by ID. Find the match in the context lists below and use its ID for the function call.
- Goal intent mapping:
  - "I read 20 more pages", "add 3 to my goal", "log 2 more" → adjustGoalProgress with a positive delta
  - "mark goal X as achieved/done/complete" → setGoalStatus status "achieved"
  - "archive goal X" → setGoalStatus "archived"; "make an achieved goal active again" → setGoalStatus "active" (note: goals already archived aren't shown in the context, so you can't reactivate them from chat)
  - "rename goal X", "change the target/deadline/unit" → updateGoal (NOT adjustGoalProgress)
  - A goal whose progress type is "tasks" derives its percent from linked tasks — do NOT nudge it; tell the user to complete its tasks instead.
- Habit intent mapping:
  - "I meditated", "check in X", "mark habit X done", "did my X today", "drank 3 glasses" → checkInHabit with a positive delta (default +1)
  - "undo my check-in for X", "I didn't actually do X" → checkInHabit with a negative delta
  - Only create daily habits — weekly scheduling isn't supported yet.
- Reminders are READ-ONLY: use listDueReminders to tell the user what's currently due. To add a reminder, tell them to set it on the task in the app.
- For destructive actions (deleteGoal, deleteHabit), confirm what will be removed before deleting.

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

    // Resolve the AI client from the user's chosen provider (falling back to the
    // AI_PROVIDER env / groq default). Null means no provider has an API key set.
    const providerPref = await getUserAIProviderPref();
    const ai = getAIClient(providerPref);
    if (!ai) {
      return NextResponse.json(
        {
          error: "AI service not configured",
          message:
            "No AI provider is configured. Add an API key for a provider and pick it in Settings.",
        },
        { status: 500 },
      );
    }

    // Fetch all four pillars for context. getGoals/getHabits/getDueReminders are
    // session-scoped (no userId param), so they can't be coaxed into an IDOR the
    // way the older getTasks(userId) signature can.
    const [userTasks, userGoals, userHabits, dueReminders] = await Promise.all([
      getTasks(session.user.id),
      getGoals(),
      getHabits(),
      getDueReminders(),
    ]);

    // Build context message with task information
    const taskContext =
      userTasks.length > 0
        ? `\n\n===== USER'S EXISTING TASKS =====\n${userTasks
            .slice(0, 15)
            .map(
              (t) =>
                `• "${t.title}" (ID: ${t.id}, Status: ${t.status}, Priority: ${t.priority}${t.dueDate ? `, Due: ${formatLocalDate(new Date(t.dueDate))}` : ""})`,
            )
            .join("\n")}${userTasks.length > 15 ? `\n... and ${userTasks.length - 15} more tasks` : ""}

IMPORTANT: When updating a task, find the task by its TITLE in the list above, then use its ID (the long string after "ID:").`
        : "\n\nUser has no tasks yet.";

    const goalContext =
      userGoals.length > 0
        ? `\n\n===== USER'S GOALS =====\n${userGoals
            .slice(0, 15)
            .map(
              (g) =>
                `• "${g.title}" (ID: ${g.id}, ${goalPercent(g as Goal)}% complete, progress: ${g.progressType}, status: ${g.status}${g.targetDate ? `, target: ${formatUTCDate(new Date(g.targetDate))}` : ""})`,
            )
            .join("\n")}${userGoals.length > 15 ? `\n... and ${userGoals.length - 15} more goals` : ""}`
        : "";

    const habitContext =
      userHabits.length > 0
        ? `\n\n===== USER'S HABITS =====\n${userHabits
            .slice(0, 15)
            .map((h) => {
              const s = computeHabitStats(h as Habit);
              return `• "${h.name}" (ID: ${h.id}, streak: ${s.currentStreak} ${s.streakUnit}s, today: ${s.todayDone ? "done" : "not yet"}, ${h.frequencyType})`;
            })
            .join("\n")}${userHabits.length > 15 ? `\n... and ${userHabits.length - 15} more habits` : ""}`
        : "";

    const reminderContext =
      dueReminders.length > 0
        ? `\n\n===== DUE REMINDERS =====\n${dueReminders
            .slice(0, 10)
            .map(
              (r) =>
                `• "${r.task?.title ?? "Task"}" reminder due ${formatReminderTime(new Date(r.triggerAt))} (ID: ${r.id})`,
            )
            .join("\n")}${dueReminders.length > 10 ? `\n... and ${dueReminders.length - 10} more due reminders` : ""}`
        : "";

    // Ground the assistant in the current date so it can resolve relative dates.
    const now = new Date();
    const todayHuman = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const todayISO = formatLocalDate(now);
    const dateContext = `Today is ${todayHuman} (ISO: ${todayISO}). When the user gives a relative date such as "today", "tomorrow", "next friday", "this month", "next month", or "in 2 weeks", resolve it against today's date and always pass dueDate to functions in ISO 8601 format (YYYY-MM-DD).`;

    // Build messages array. Everything the model needs up front (instructions,
    // date grounding, and the current user context) goes into a SINGLE system
    // message so the conversation is system → user across every provider. Anthropic
    // and Gemini's OpenAI-compat endpoints require the first non-system message to
    // be a user turn (a leading assistant/second-system message 400s), so we must
    // not emit the context as its own assistant message.
    const systemContent = `${systemPrompt}

${dateContext}

Current user context:${taskContext}${goalContext}${habitContext}${reminderContext}`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    // Call the provider with function/tool calling.
    const response = await ai.client.chat.completions.create({
      model: ai.chatModel,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const choice = response.choices[0];
    const messageContent = choice.message?.content || "";

    // Check if the model wants to call a tool (we handle a single tool call).
    const toolCall = choice.message?.tool_calls?.[0];
    if (toolCall) {
      const functionName = toolCall.function.name;
      let functionArgs: Record<string, any> = {};

      try {
        functionArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch (e) {
        return NextResponse.json({
          message:
            "I had trouble understanding that request. Could you rephrase it?",
        });
      }

      // Execute the function
      let result;
      // Keep only the tool call we're handling on the assistant message: we return
      // exactly one tool result, and providers reject a follow-up where an
      // assistant message has tool_calls without a matching result for each.
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        ...choice.message,
        role: "assistant",
        tool_calls: [toolCall],
      };
      let followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        [...messages, assistantMsg];

      // Append a tool-result message (matched to this tool call by id) that the
      // model reads on the follow-up call to compose its reply.
      const pushFunctionResult = (payload: Record<string, unknown>) => {
        followUpMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(payload),
        });
      };

      switch (functionName) {
        case "createTask":
          result = await createTask(functionArgs as any);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, task: result.task },
          );
          break;

        case "updateTask":
          // Backstop the prompt's "don't blank the description" rule: the task
          // context sent to the model omits descriptions and there is no
          // "clear the description" intent, so an empty/whitespace description on
          // an edit is never intended — drop it rather than let it overwrite the
          // user's existing notes. (The in-app edit form clears descriptions via
          // updateTask directly, so this guard lives on the AI path only, not in
          // the shared action.)
          if (
            typeof functionArgs.description === "string" &&
            functionArgs.description.trim() === ""
          ) {
            delete functionArgs.description;
          }
          result = await updateTask(
            functionArgs.id as string,
            functionArgs as any,
          );
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, task: result.task },
          );
          break;

        case "deleteTask":
          console.log(
            "[Chat API] Delete task called with ID:",
            functionArgs.id,
          );
          result = await deleteTask(functionArgs.id as string);
          console.log("[Chat API] Delete result:", result);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : {
                  success: true,
                  message: "Task deleted successfully",
                },
          );
          break;

        case "listTasks":
          const tasks = await getTasks(session.user.id);
          pushFunctionResult({ tasks });
          break;

        // ---- Goals ----
        case "createGoal":
          result = await createGoal(functionArgs as any);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, goal: result.goal },
          );
          break;

        case "updateGoal":
          result = await updateGoal(
            functionArgs.id as string,
            functionArgs as any,
          );
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, goal: result.goal },
          );
          break;

        case "adjustGoalProgress":
          result = await adjustGoalProgress(
            functionArgs.id as string,
            functionArgs.delta as number,
          );
          pushFunctionResult(
            result.error ? { error: result.error } : { success: true },
          );
          break;

        case "setGoalStatus":
          result = await setGoalStatus(
            functionArgs.id as string,
            functionArgs.status as string,
          );
          pushFunctionResult(
            result.error ? { error: result.error } : { success: true },
          );
          break;

        case "deleteGoal":
          result = await deleteGoal(functionArgs.id as string);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, message: "Goal deleted successfully" },
          );
          break;

        case "listGoals": {
          // Reuse the goals already fetched for context this request.
          result = userGoals.map((g) => ({
            id: g.id,
            title: g.title,
            percent: goalPercent(g as Goal),
            status: g.status,
            progressType: g.progressType,
            targetDate: g.targetDate
              ? formatUTCDate(new Date(g.targetDate))
              : null,
          }));
          pushFunctionResult({ goals: result });
          break;
        }

        // ---- Habits ----
        case "createHabit":
          result = await createHabit(functionArgs as any);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, habit: result.habit },
          );
          break;

        case "checkInHabit":
          result = await checkInHabit(functionArgs as any);
          pushFunctionResult(
            result.error ? { error: result.error } : { success: true },
          );
          break;

        case "listHabits": {
          // Reuse the habits already fetched for context this request.
          result = userHabits.map((h) => {
            const s = computeHabitStats(h as Habit);
            return {
              id: h.id,
              name: h.name,
              currentStreak: s.currentStreak,
              streakUnit: s.streakUnit,
              todayDone: s.todayDone,
              monthlyRate: s.monthlyRate,
            };
          });
          pushFunctionResult({ habits: result });
          break;
        }

        case "deleteHabit":
          result = await deleteHabit(functionArgs.id as string);
          pushFunctionResult(
            result.error
              ? { error: result.error }
              : { success: true, message: "Habit deleted successfully" },
          );
          break;

        // ---- Reminders (read-only) ----
        case "listDueReminders": {
          // Reuse the due reminders already fetched for context this request.
          result = dueReminders.map((r) => ({
            id: r.id,
            taskId: r.task?.id,
            taskTitle: r.task?.title,
            triggerAt: r.triggerAt,
          }));
          pushFunctionResult({ reminders: result });
          break;
        }

        default:
          return NextResponse.json({
            message: "I'm not sure how to help with that request.",
          });
      }

      // Get final response from the provider with the tool results.
      const finalResponse = await ai.client.chat.completions.create({
        model: ai.chatModel,
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
