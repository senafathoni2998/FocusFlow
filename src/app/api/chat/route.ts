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
    // A body the server cannot parse is the CALLER's mistake, so it gets a 4xx.
    // This used to answer 500 — an accident of the request being parsed inside
    // the handler's outer try — which told a client with a broken payload that
    // the server had failed, so the sensible reaction was to retry the same
    // broken request rather than fix it. Every other /api/v1 route already maps
    // a malformed body to 400 via readJson; this is the last one that did not.
    return NextResponse.json(
      { error: "Invalid request body", message: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  return runChat(webPort, { message: body?.message, history: body?.history });
}
