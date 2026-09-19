import { NextResponse } from "next/server";
import { habitInsights, type HabitInsightsResult } from "@/agents/habitAgent";
import { buildHabitProfile, flattenStats } from "@/core/habits";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Wording is cached per profile so a page refresh does not spend a model call; a new completion changes the key. */
const g = globalThis as unknown as { __habitCache?: Map<string, HabitInsightsResult> };

/**
 * GET /api/habits           -> the student's measured patterns and up to three insights.
 * GET /api/habits?source=rules -> same, written by code only (no model call).
 * Read-only: nothing here changes the plan; insights are suggestions.
 */
export async function GET(req: Request) {
  const s = store();
  const profile = buildHabitProfile(s.habits);
  const stats = flattenStats(profile);
  const useModel = new URL(req.url).searchParams.get("source") !== "rules";

  const cache = (g.__habitCache ??= new Map());
  const key = JSON.stringify([stats, useModel]);
  let result = cache.get(key);
  if (!result) {
    result = await habitInsights(profile, { useModel });
    if (result.provider !== "heuristic" || !useModel) cache.set(key, result);
    if (cache.size > 20) cache.delete(cache.keys().next().value!);
    log("agent", "habit_insights", { provider: result.provider, model: result.model, latencyMs: result.latencyMs, rejected: result.rejected, rejections: result.rejections, insights: result.insights.length });
  }

  return NextResponse.json({
    sessions: profile.sessions,
    activeDays: profile.activeDays,
    syntheticShare: profile.sessions ? s.habits.filter((h) => h.synthetic).length / s.habits.length : 0,
    stats,
    insights: result.insights,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    rejected: result.rejected,
    rejections: result.rejections,
    error: result.error,
  });
}
