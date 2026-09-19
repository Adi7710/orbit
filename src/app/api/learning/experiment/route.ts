import { NextResponse } from "next/server";
import { studentB } from "@/core/student";
import { ASPECTS, reportMarkdown, runExperiment, traceMarkdown, type Arm, type Aspect } from "@/agents/learningExperiment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/learning/experiment?aspect=assignments&arms=raw,existing,rules,nemotron[&student=b]
 * student=b replays the held-out second student instead of the first.
 * Replays the synthetic student week by week and scores each arm. The
 * weekly-nemotron arm makes one hosted call per week (sequential), so it takes a
 * minute or two; leave it out for an instant run. It also returns `trace`, the
 * week-by-week record of what the learner saw and changed.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const aspect = (u.searchParams.get("aspect") ?? "assignments") as Aspect;
  if (!(aspect in ASPECTS)) return NextResponse.json({ error: `unknown aspect; try ${Object.keys(ASPECTS).join(", ")}` }, { status: 400 });
  const wanted = (u.searchParams.get("arms") ?? "raw,existing,rules").split(",") as Arm[];
  const arms = wanted.filter((a) => ["raw", "existing", "rules", "nemotron", "weekly-rules", "weekly-nemotron"].includes(a));
  const heldOut = u.searchParams.get("student") === "b";
  const result = await runExperiment(aspect, arms, heldOut ? { student: studentB() } : {});
  return NextResponse.json({ ...result, markdown: reportMarkdown(result), trace: arms.includes("weekly-nemotron") ? traceMarkdown(result) : arms.includes("weekly-rules") ? traceMarkdown(result, "weekly-rules") : undefined });
}
