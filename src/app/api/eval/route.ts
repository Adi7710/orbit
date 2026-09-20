import { NextResponse } from "next/server";
import { estimateTask, type EstimateVariant } from "@/agents/estimate";
import { heuristicMinutes } from "@/core/estimator";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * NVIDIA track evidence. Three scorers on the same synthetic session log:
 *
 *   heuristic  a ten-line title matcher, no model
 *   zeroshot   Nemotron with the prompt we shipped first
 *   anchored   Nemotron given the heuristic as a baseline, clamped in code
 *              to between half and double it
 *
 * Reports mean absolute error, how often it lands within 25% of the real
 * duration, the worst single miss, latency, how often the clamp fired, and
 * which provider actually answered. Calls run in parallel because ten
 * sequential calls at about 7 s each is a minute and a half of waiting.
 *
 * GET /api/eval                -> all three
 * GET /api/eval?variant=anchored -> one
 */
const truth: { title: string; course?: string; minutes: number }[] = [
  { title: "Problem Set 4", course: "MATH 0220", minutes: 96 },
  { title: "Reading: Chapter 3", course: "CS 0441", minutes: 38 },
  { title: "Lab 2 report", course: "PHYS 0174", minutes: 130 },
  { title: "Essay draft", course: "ENGCMP 0200", minutes: 200 },
  { title: "Quiz 3 prep", course: "CS 0441", minutes: 50 },
  { title: "Discussion post", course: "ENGCMP 0200", minutes: 25 },
  { title: "Midterm review", course: "MATH 0220", minutes: 260 },
  { title: "Gym", minutes: 65 },
  { title: "Project milestone 2", course: "CS 0441", minutes: 210 },
  { title: "Homework 5", course: "PHYS 0174", minutes: 110 },
];

interface Row { title: string; actual: number; predicted: number; errorMin: number; within25: boolean }

function summarize(rows: Row[]) {
  const n = rows.length;
  const mae = rows.reduce((s, r) => s + r.errorMin, 0) / n;
  const worst = rows.reduce((a, b) => (b.errorMin > a.errorMin ? b : a));
  return {
    mae: +mae.toFixed(1),
    within25pct: `${rows.filter((r) => r.within25).length}/${n}`,
    worstMiss: `${worst.title}: predicted ${worst.predicted}, actual ${worst.actual}`,
  };
}

/** Run `fn` over `items` with at most `n` in flight, preserving order. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function GET(req: Request) {
  const only = new URL(req.url).searchParams.get("variant") as EstimateVariant | null;
  const variants: EstimateVariant[] = only ? [only] : ["zeroshot", "anchored"];

  const heurRows: Row[] = truth.map((x) => {
    const p = heuristicMinutes(x.title);
    const e = Math.abs(p - x.minutes);
    return { title: x.title, actual: x.minutes, predicted: p, errorMin: e, within25: e / x.minutes <= 0.25 };
  });

  const results: Record<string, unknown> = { heuristic: { ...summarize(heurRows), cost: "$0", note: "no model, ten lines of title matching" } };
  const detail: Record<string, unknown[]> = { heuristic: heurRows };

  for (const variant of variants) {
    // One at a time. Ten parallel calls on one key trip NVIDIA's 429 and
    // queue behind each other, which read as "hosted latency is 14 s" and
    // "answered 4/10"; even two in flight still drew 429s. Measured alone, a
    // call is about a second, so a variant is about ten seconds.
    const settled = await pool(truth, 1, (x) => estimateTask(x.title, x.course, variant));
    const rows: Row[] = settled.map((r, i) => {
      const e = Math.abs(r.minutes - truth[i].minutes);
      return { title: truth[i].title, actual: truth[i].minutes, predicted: r.minutes, errorMin: e, within25: e / truth[i].minutes <= 0.25 };
    });
    const answered = settled.filter((r) => r.provider === "nemotron-hosted");
    results[variant] = {
      ...summarize(rows),
      avgLatencyMs: Math.round(settled.reduce((s, r) => s + r.latencyMs, 0) / settled.length),
      answeredByModel: `${answered.length}/${settled.length}`,
      fellBackToHeuristic: settled.length - answered.length,
      clampFired: variant === "anchored" ? settled.filter((r) => r.clamped).length : undefined,
      model: settled.find((r) => r.model)?.model,
      errors: [...new Set(settled.map((r) => r.error).filter(Boolean))],
    };
    detail[variant] = settled.map((r, i) => ({
      title: truth[i].title, actual: truth[i].minutes, baseline: r.baseline,
      modelSaid: r.rawMinutes, used: r.minutes, clamped: r.clamped, latencyMs: r.latencyMs, provider: r.provider,
    }));
  }

  return NextResponse.json({
    summary: results,
    detail,
    note: "Ground truth is a synthetic session log of ten tasks. Replace with real logged sessions as students accumulate them; the estimator already stores guess-versus-actual per course.",
  });
}
