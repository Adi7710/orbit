import { heuristicMinutes } from "@/core/estimator";
import { nemotronJson, type Provider } from "./models";

/**
 * Nemotron's non-chat job #1: how many focused minutes a task takes, and which
 * ring it belongs to. Evaluated at /api/eval against a synthetic session log.
 *
 * Two variants, both kept so the eval can report the honest story:
 *
 *  - "zeroshot" is the prompt we shipped first. Its bands say "exam prep
 *    180-360" and say nothing about quizzes, so "Quiz 3 prep" came back at 240
 *    minutes against 50 actual and the whole variant scored worse than a
 *    ten-line heuristic (MAE 35.3 vs 16.3). Left unchanged on purpose so the
 *    failure stays reproducible.
 *
 *  - "anchored" gives the model the heuristic as a baseline and clamps its
 *    answer to between half and double that in code. The model can still
 *    correct the baseline where the title is informative, but a 5x miss is
 *    structurally impossible rather than merely discouraged.
 */
export type EstimateVariant = "zeroshot" | "anchored";

export interface EstimateOut { minutes: number; domain: "learn" | "build" | "body" | "life"; confidence: number }
export interface EstimateResult extends EstimateOut {
  provider: Provider;
  model?: string;
  latencyMs: number;
  variant: EstimateVariant;
  baseline: number;
  /** True when the model's answer fell outside [0.5x, 2x] of the baseline and code pulled it back. */
  clamped: boolean;
  rawMinutes: number;
  error?: string;
}

const schema = {
  type: "object",
  properties: {
    minutes: { type: "integer" },
    domain: { type: "string", enum: ["learn", "build", "body", "life"] },
    confidence: { type: "number" },
  },
  required: ["minutes", "domain", "confidence"],
  additionalProperties: false,
};

const ZEROSHOT_SYSTEM =
  "You estimate how many focused minutes a college task takes. Reply with JSON only. Problem sets 60-150, readings 20-60, essays 120-300, exams prep 180-360, gym 45-90. Domain: learn=reading/studying, build=graded deliverables, body=exercise/health, life=errands/social.";

const ANCHORED_SYSTEM = [
  "You adjust a baseline estimate of how many focused minutes a college task takes. Reply with JSON only.",
  "Keep the baseline unless the title clearly indicates otherwise, and never move more than a factor of two from it.",
  "Typical bands: reading 20-60, discussion post 20-40, quiz or quiz prep 30-60, problem set or homework 60-150, lab report 90-150, project milestone 120-240, essay or paper 120-300, midterm or final prep 180-360, gym 45-90.",
  "A quiz is not an exam. A milestone is not a whole project.",
  "Domain: learn=reading or studying, build=graded deliverables, body=exercise or health, life=errands or social.",
].join(" ");

export async function estimateTask(title: string, courseCode?: string, variant: EstimateVariant = "anchored"): Promise<EstimateResult> {
  const baseline = heuristicMinutes(title);
  const anchored = variant === "anchored";
  const user = anchored
    ? `Task: ${title}${courseCode ? ` (${courseCode})` : ""}\nBaseline estimate: ${baseline} minutes.`
    : `Task: ${title}${courseCode ? ` (${courseCode})` : ""}`;

  const r = await nemotronJson<EstimateOut>(
    anchored ? ANCHORED_SYSTEM : ZEROSHOT_SYSTEM,
    user,
    schema,
    () => ({ minutes: baseline, domain: "build" as const, confidence: 0.3 }),
  );

  const raw = Math.max(1, Math.round(r.data.minutes));
  let minutes = raw;
  let clamped = false;
  if (anchored && r.provider !== "heuristic") {
    const lo = Math.round(baseline * 0.5), hi = Math.round(baseline * 2);
    minutes = Math.min(hi, Math.max(lo, raw));
    clamped = minutes !== raw;
  }

  return {
    minutes,
    domain: r.data.domain,
    confidence: r.data.confidence,
    provider: r.provider,
    model: r.model,
    latencyMs: r.latencyMs,
    variant,
    baseline,
    clamped,
    rawMinutes: raw,
    error: r.error,
  };
}
