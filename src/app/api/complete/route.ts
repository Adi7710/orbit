import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";
import { xpFor } from "@/core/game";
import { findGaps } from "@/core/gaps";
import { fromDate } from "@/core/time";

export const dynamic = "force-dynamic";

/** Complete a task with the actual minutes it took. XP is computed by the core rules, not the client. */
export async function POST(req: Request) {
  const { taskId, actualMinutes } = (await req.json()) as { taskId: string; actualMinutes: number };
  const s = store();
  const task = s.tasks.find((t) => t.id === taskId);
  if (!task || task.completedAt) return NextResponse.json({ ok: false }, { status: 409 });
  const planned = s.estimator.planningMinutes(task);
  const now = new Date();
  const nowMin = fromDate(now, "America/New_York");
  const gap = findGaps(s.blocks, s.profile, s.travel).find((g) => nowMin >= g.start && nowMin <= g.end);
  task.completedAt = now;
  s.estimator.record(task.courseCode, task.domain, task.estimateMinutes, actualMinutes);
  const { xp, reasons } = xpFor({ task, actualMinutes, plannedMinutes: planned, completedInGap: gap, completedAt: now }, s.mode, s.user.streakWeeks);
  s.user.xpWeek += xp;
  const row = s.board.find((r) => r.userId === s.user.id);
  if (row) row.xpWeek = s.user.xpWeek;
  log("user", "task_completed", { taskId, actualMinutes, planned, xp, reasons });
  return NextResponse.json({ ok: true, xp, reasons, planned, multiplier: s.estimator.multiplier(task.courseCode, task.domain) });
}
