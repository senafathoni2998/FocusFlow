import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTask,
  updateTask,
  completeTask,
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
import { runChat } from "@/lib/chat/core";
import type { ChatPort } from "@/lib/chat/port";

/**
 * The web assistant.
 *
 * All the logic lives in lib/chat/core.ts; this file only says WHO is asking and
 * WHICH data layer answers. Every function below is session-scoped — none takes a
 * caller-supplied user id — so the port cannot be pointed at another account.
 */
const webPort: ChatPort = {
  getTasks: () => getTasks(),
  createTask: (data) => createTask(data as Parameters<typeof createTask>[0]),
  updateTask: (id, data) => updateTask(id, data as Parameters<typeof updateTask>[1]),
  completeTask: (id) => completeTask(id),
  deleteTask: (id) => deleteTask(id),

  getGoals: () => getGoals(),
  createGoal: (data) => createGoal(data as Parameters<typeof createGoal>[0]),
  updateGoal: (id, data) => updateGoal(id, data as Parameters<typeof updateGoal>[1]),
  adjustGoalProgress: (id, delta) => adjustGoalProgress(id, delta),
  setGoalStatus: (id, status) => setGoalStatus(id, status),
  deleteGoal: (id) => deleteGoal(id),

  getHabits: () => getHabits(),
  createHabit: (data) => createHabit(data as Parameters<typeof createHabit>[0]),
  checkInHabit: (data) => checkInHabit(data as Parameters<typeof checkInHabit>[0]),
  deleteHabit: (id) => deleteHabit(id),

  getDueReminders: () => getDueReminders(),
  getUserAIProviderPref: () => getUserAIProviderPref(),
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    // Preserved verbatim from before the port refactor: a malformed body used to
    // fall through to the handler's outer catch and surface as this 500. A 400
    // would be more accurate — it is the caller's mistake — but changing it here
    // would smuggle a behaviour change into a refactor, so it stays as it was.
    return NextResponse.json(
      {
        error: "Failed to process chat message",
        message: "Sorry, something went wrong. Please try again.",
      },
      { status: 500 },
    );
  }

  return runChat(webPort, { message: body?.message, history: body?.history });
}
