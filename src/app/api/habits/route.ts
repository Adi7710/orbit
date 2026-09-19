import { NextResponse } from "next/server";
import { habitInsightsCached } from "@/agents/habitAgent";
import { buildHabitProfile, flattenStats } from "@/core/habits";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/habits              -> the student's measured patterns and up to three insights.
 * GET /api/habits?source=rules -> same, written by code only (no model call).
 * Read-only: nothing here changes the plan; insights are suggestions.
 */
export async function GET(req: Request) {
  const s = store();
  const profile = buildHabitProfile(s.habits);
  const useModel = new URL(req.url).searchParams.get("source") !== "rules";
  const result = await habitInsightsCached(profile, { useModel });
  if (!result.cached) log("agent", "habit_insights", { provider: result.provider, model: result.model, latencyMs: result.latencyMs, rejected: result.rejected, rejections: result.rejections, insights: result.insights.length });

  return NextResponse.json({
    sessions: profile.sessions,
    activeDays: profile.activeDays,
    syntheticShare: s.habits.length ? s.habits.filter((h) => h.synthetic).length / s.habits.length : 0,
    stats: flattenStats(profile),
    insights: result.insights,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    rejected: result.rejected,
    rejections: result.rejections,
    error: result.error,
  });
}
