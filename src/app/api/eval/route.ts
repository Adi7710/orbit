import { NextResponse } from "next/server";
import { estimateTask } from "@/agents/estimate";
import { heuristicMinutes } from "@/core/estimator";

export const dynamic = "force-dynamic";

/**
 * NVIDIA track evidence: Nemotron's task-minute estimates vs a title heuristic
 * vs ground truth from a synthetic session log. Reports MAE, within-25% hit
 * rate, latency, and the provider that actually answered.
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

export async function GET() {
  const rows = [];
  let nemoErr = 0, heurErr = 0, nemoHit = 0, heurHit = 0, latency = 0;
  const providers = new Set<string>();
  for (const x of truth) {
    const n = await estimateTask(x.title, x.course);
    const h = heuristicMinutes(x.title);
    providers.add(n.provider);
    latency += n.latencyMs;
    const ne = Math.abs(n.data.minutes - x.minutes), he = Math.abs(h - x.minutes);
    nemoErr += ne; heurErr += he;
    if (ne / x.minutes <= 0.25) nemoHit++;
    if (he / x.minutes <= 0.25) heurHit++;
    rows.push({ ...x, nemotron: n.data.minutes, heuristic: h, provider: n.provider, latencyMs: n.latencyMs });
  }
  const n = truth.length;
  return NextResponse.json({
    rows,
    summary: {
      nemotron: { mae: +(nemoErr / n).toFixed(1), within25pct: `${nemoHit}/${n}`, avgLatencyMs: Math.round(latency / n), providers: [...providers] },
      heuristic: { mae: +(heurErr / n).toFixed(1), within25pct: `${heurHit}/${n}` },
      note: "Ground truth is a synthetic session log. Replace with real logged sessions as they accumulate.",
    },
  });
}
