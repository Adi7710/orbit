import { store } from "./store";
import type { Task } from "@/core/types";

/**
 * The one place a finished task becomes a row in the learning log. Both the tap
 * path (/api/complete) and the voice path (log_actual) call it, so what the
 * student says out loud teaches the app exactly as much as what they tap.
 */
export function recordHabit(task: Task, actualMinutes: number, completedAt: Date, inGap: boolean) {
  store().habits.push({
    taskId: task.id,
    title: task.title,
    domain: task.domain,
    courseCode: task.courseCode,
    plannedMinutes: task.estimateMinutes,
    actualMinutes,
    completedAt,
    inGap,
    dueAt: task.dueAt,
  });
}
