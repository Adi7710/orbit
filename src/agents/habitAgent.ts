import { BUCKET_LABEL, DOMAIN_LABEL, deterministicInsights, flattenStats, whyRejected, type HabitProfile, type Insight, type InsightKind } from "@/core/habits";
import { nemotronJson, type Provider } from "./models";

/**
 * Nemotron's non-chat job #3: turn a student's measured habits into a few
 * plain sentences and one concrete suggestion each.
 *
 * The model never sees raw history and never does arithmetic. It gets the
 * numbers code already computed, plus the sentences code would have written
 * itself, and is asked to say them better and to cite the stat keys it used.
 * Then code checks every claim (verifyInsight). An insight that cites a wrong
 * number, an unknown key, or a statistic that is not in its evidence is dropped
 * and the code's own sentence for that kind is used instead, so a hallucinated
 * habit cannot reach the screen. It only suggests; nothing here changes the plan.
 */
const KINDS: InsightKind[] = ["best_window", "overrun", "deadline_style", "in_gap"];

const schema = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: KINDS },
          text: { type: "string" },
          suggestion: { type: "string" },
          evidence: { type: "array", items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"], additionalProperties: false } },
        },
        required: ["kind", "text", "suggestion", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["insights"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are Orbit's habit coach: a sharp, warm friend who has read a student's own numbers. Never shaming, never cringe.",
  "You receive measured stats and draft insights. Rewrite the draft insights so they sound like a friend, in at most 22 words for text and 16 for suggestion.",
  "Hard rules: use only numbers that appear in the stats, never invent or round differently; every insight lists in evidence the stat key behind EVERY number and label in its text (for a percent faster or slower, cite the pace key it comes from; for a window, cite the bucket key too) with the exact value from the stats;",
  "keep each insight's kind; do not add advice about health, sleep, or grades; one insight per kind; at most three insights.",
  "Pace below 1 means faster than the student's normal for that kind of task; ratio is actual minutes divided by the student's own estimate.",
].join(" ");

export interface HabitInsight extends Insight { source: "nemotron" | "rules" }
export interface HabitInsightsResult {
  insights: HabitInsight[];
  provider: Provider;
  model?: string;
  latencyMs: number;
  /** Insights the model wrote that failed verification and were replaced by the code's sentence. */
  rejected: number;
  /** What the model said and why it was refused, for the timeline and for debugging prompts. */
  rejections: { kind: string; text: string; reason: string; evidence?: Record<string, number | string> }[];
  error?: string;
}

type Raw = { insights?: { kind?: string; text?: string; suggestion?: string; evidence?: { key?: string; value?: string }[] }[] };

const parseValue = (v: string | undefined): number | string => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) ? n : (v ?? "");
};

export async function habitInsights(p: HabitProfile, opts: { useModel?: boolean } = {}): Promise<HabitInsightsResult> {
  const drafts = deterministicInsights(p);
  const rules = (): HabitInsight[] => drafts.map((d) => ({ ...d, source: "rules" as const }));
  if (drafts.length === 0) return { insights: [], provider: "heuristic", latencyMs: 0, rejected: 0, rejections: [] };
  if (opts.useModel === false) return { insights: rules(), provider: "heuristic", latencyMs: 0, rejected: 0, rejections: [] };

  const user = JSON.stringify({
    stats: flattenStats(p),
    bucketLabels: BUCKET_LABEL,
    domainLabels: DOMAIN_LABEL,
    draftInsights: drafts,
  });
  const r = await nemotronJson<Raw>(SYSTEM, user, schema, () => ({ insights: [] }), 20000);
  if (r.provider === "heuristic") return { insights: rules(), provider: r.provider, model: r.model, latencyMs: r.latencyMs, rejected: 0, rejections: [], error: r.error };

  const said = new Map<InsightKind, HabitInsight>();
  const rejections: HabitInsightsResult["rejections"] = [];
  for (const raw of r.data.insights ?? []) {
    const kind = raw.kind as InsightKind;
    const draft = drafts.find((d) => d.kind === kind);
    if (!draft || said.has(kind)) { rejections.push({ kind: String(raw.kind), text: raw.text ?? "", reason: !draft ? "no such insight kind" : "duplicate kind" }); continue; }
    const evidence: Record<string, number | string> = {};
    for (const e of raw.evidence ?? []) if (e.key) evidence[e.key] = parseValue(e.value);
    const candidate: Insight = { kind, text: (raw.text ?? "").trim(), suggestion: (raw.suggestion ?? "").trim(), evidence };
    const reason = !candidate.text || !candidate.suggestion ? "empty text or suggestion" : whyRejected(candidate, p);
    if (!reason) said.set(kind, { ...candidate, source: "nemotron" });
    else rejections.push({ kind, text: candidate.text, reason, evidence });
  }
  // Keep the code's order and fill anything the model dropped or got wrong with the code's own sentence.
  const insights = drafts.map((d) => said.get(d.kind) ?? { ...d, source: "rules" as const });
  return { insights, provider: "nemotron-hosted", model: r.model, latencyMs: r.latencyMs, rejected: rejections.length, rejections };
}
