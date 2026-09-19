import { KIND_LABEL, TASK_KINDS, applyDecisions, weeklyCandidates, type Candidate, type Decision, type LearnedProfile, type LearningNote, type TaskKind } from "@/core/learning";
import type { HabitRecord } from "@/core/habits";
import { nemotronJson, type Provider } from "./models";

/**
 * The weekly review. Once a week code measures how each kind of work went
 * against the plan (weeklyCandidates), and Nemotron decides which corrections to
 * adopt and writes what it noticed, continuing from its own notes of earlier
 * weeks. That is the "growing" part: the notes are its memory.
 *
 * What the model can and cannot do:
 *  - It picks adopt, step or hold per kind. The numbers those actions move to
 *    are computed in code. It cannot invent a multiplier.
 *  - Code refuses to change a kind with too little evidence, whatever it says.
 *  - Every number in a note must be one it was given; a note that cites anything
 *    else is replaced by the code's own sentence.
 *  - With no key, or on any failure, the rules decision (adopt what is eligible)
 *    is used, and the review says so.
 * Hosted Nemotron is not retrained weekly; the learned profile is the memory.
 */
const KINDS_AND_GENERAL = [...TASK_KINDS, "general"] as const;

const schema = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: TASK_KINDS }, action: { type: "string", enum: ["adopt", "step", "hold"] }, reason: { type: "string" } },
        required: ["kind", "action", "reason"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: KINDS_AND_GENERAL }, text: { type: "string" } },
        required: ["kind", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["decisions", "notes"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are Orbit's weekly coach for one student. Each week you review how long each kind of work really took against the student's own estimate, and decide which corrections to the plan to adopt.",
  "You calculate nothing: every number is given to you. Ratio means actual minutes divided by the student's estimate. A ratio above 1 means the work took LONGER than the student thought, so they underestimate it; a ratio below 1 means it took less time than they thought, so they overestimate it. A multiplier scales the student's estimate when the app plans their time.",
  "Actions: adopt moves the multiplier to target, step moves it halfway, hold leaves it alone.",
  "Rules: never adopt or step a candidate with eligible false. Adopt when the weekly ratios agree with each other. Prefer hold when one odd week disagrees with the rest and the sample is small. Prefer step when the ratio has moved steadily in one direction over the last weeks, because the student is changing.",
  "Give one decision for every candidate marked eligible true, with a reason of at most 12 words.",
  "Each candidate has a trend computed by the code (up, down, flat, or unclear). Only describe a trend if it says up or down, and in that direction; never call a flat or unclear one a trend, and never say the student is improving or getting faster unless the trend is down. Count sessions as sessions and weeks as weeks.",
  "Notes: at most three, each one plain sentence under 25 words, the way a friend would say it, about the biggest thing you learned this week. Use only numbers that appear in the data: ratios written like 1.33x, counts, or an example's minutes. Do not repeat a note from previousNotes; build on it.",
].join(" ");

export interface WeeklyReview {
  week: number;
  candidates: Candidate[];
  decisions: (Decision & { source: "nemotron" | "rules" })[];
  notes: LearningNote[];
  provider: Provider;
  model?: string;
  latencyMs: number;
  /** Things the model said that code refused, with the reason. */
  rejections: { what: string; reason: string }[];
  error?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (x: number) => Math.round(x * 100);
const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/** Numbers a note about this kind may cite. */
function allowedFor(c: Candidate): number[] {
  const ratios = [c.meanRatio, c.target, c.current, ...c.weeklyRatio.map((w) => w.ratio)];
  const out = [c.n, c.example.estimate, c.example.actual, c.example.actual - c.example.estimate, hours(c.example.estimate), hours(c.example.actual), c.example.week, c.weeklyRatio.length, ...c.weeklyRatio.map((w) => w.week), ...c.weeklyRatio.map((w) => w.n)];
  for (const r of ratios) out.push(r, r2(r), Math.round(r * 10) / 10, pct(Math.abs(r - 1)), pct(r));
  return out;
}

/** Why a note is refused, or undefined when every number in it is one the code supplied. */
export function whyNoteRejected(text: string, kind: string, candidates: Candidate[], week: number): string | undefined {
  if (!text.trim()) return "empty";
  const pool = kind === "general" ? candidates.flatMap(allowedFor) : allowedFor(candidates.find((c) => c.kind === kind) ?? candidates[0] ?? ({ n: 0, meanRatio: 0, target: 0, current: 0, weeklyRatio: [], example: { estimate: 0, actual: 0, week: 0 } } as unknown as Candidate));
  pool.push(week, week - 1, candidates.length);
  // Numbers can be right and the meaning backwards: a ratio above 1 is UNDERestimation.
  const own = candidates.find((c) => c.kind === kind);
  if (own) {
    const down = /(trend(?:ing|ed)? down|dropp(?:ing|ed)|declin|decreas|getting faster|improv|falling)/i.test(text);
    const up = /(trend(?:ing|ed)? up|drift(?:ing|ed|s)? up|upward|rising|climb|increasing|creep(?:ing)? up|getting slower)/i.test(text);
    if ((down || up) && (own.trend === "flat" || own.trend === "unclear")) return `claims a trend the data does not show (it is ${own.trend})`;
    if (down && !up && own.trend === "up") return "says down but the weekly ratios went up";
    if (up && !down && own.trend === "down") return "says up but the weekly ratios went down";
    const weeksSaid = [...text.matchAll(/(\d+)\s+weeks?\b/gi)].map((m) => Number(m[1]));
    if (weeksSaid.some((n) => n !== own.weeklyRatio.length && n !== week)) return "counts weeks that do not match the weeks of data";
    const sessionsSaid = [...text.matchAll(/(\d+)\s+sessions?\b/gi)].map((m) => Number(m[1]));
    if (sessionsSaid.some((n) => n !== own.n)) return "counts sessions that do not match the sessions logged";
  }
  if (own && own.meanRatio > 1 && /over-?estimat/i.test(text)) return "says overestimation but the work took longer than estimated";
  if (own && own.meanRatio < 1 && /under-?estimat/i.test(text)) return "says underestimation but the work took less time than estimated";
  const prose = text.replace(/\bweeks?\s+\d+/gi, " ");
  const stray = (prose.match(/\d+(?:\.\d+)?/g) ?? []).find((n) => !pool.some((a) => Math.abs(a - Number(n)) < 0.011));
  return stray === undefined ? undefined : `the number ${stray} was not in the data`;
}

const say = (n: number) => `${r2(n)}x`;
/** The sentence code writes itself; also the fallback for a note the model got wrong. */
export function ruleNote(c: Candidate, week: number): LearningNote {
  const faster = c.meanRatio < 1;
  return {
    week,
    kind: c.kind,
    source: "rules",
    text: `${KIND_LABEL[c.kind][0].toUpperCase()}${KIND_LABEL[c.kind].slice(1)} took ${say(c.meanRatio)} your estimate over ${c.n} sessions (${c.example.title}: planned ${c.example.estimate}, took ${c.example.actual}), so I plan ${say(c.target)} from now on${faster ? "" : ""}.`,
  };
}

export async function reviewWeek(history: HabitRecord[], learned: LearnedProfile, week: number, opts: { useModel?: boolean } = {}): Promise<{ profile: LearnedProfile; review: WeeklyReview }> {
  const candidates = weeklyCandidates(history, learned, week);
  const eligible = candidates.filter((c) => c.eligible);
  const rulesDecisions = (why: string): WeeklyReview["decisions"] => eligible.map((c) => ({ kind: c.kind, action: "adopt" as const, reason: why, source: "rules" as const }));
  const finish = (decisions: WeeklyReview["decisions"], notes: LearningNote[], meta: Pick<WeeklyReview, "provider" | "model" | "latencyMs" | "rejections" | "error">) => {
    const profile = applyDecisions(learned, candidates, decisions, week, notes);
    return { profile, review: { week, candidates, decisions, notes, ...meta } };
  };
  const rulesNotes = () => eligible.slice(0, 3).map((c) => ruleNote(c, week));

  if (eligible.length === 0) return finish([], [], { provider: "heuristic", latencyMs: 0, rejections: [] });
  if (opts.useModel === false) return finish(rulesDecisions("enough evidence"), rulesNotes(), { provider: "heuristic", latencyMs: 0, rejections: [] });

  const user = JSON.stringify({
    week,
    candidates: candidates.map((c) => ({ kind: c.kind, label: KIND_LABEL[c.kind], n: c.n, meanRatio: c.meanRatio, weeklyRatio: c.weeklyRatio, trend: c.trend, current: c.current, target: c.target, eligible: c.eligible, example: c.example })),
    previousNotes: learned.notes.slice(-6).map((n) => ({ week: n.week, kind: n.kind, text: n.text })),
  });
  type Raw = { decisions?: { kind?: string; action?: string; reason?: string }[]; notes?: { kind?: string; text?: string }[] };
  const r = await nemotronJson<Raw>(SYSTEM, user, schema, () => ({ decisions: [], notes: [] }), 90000, 900);
  if (r.provider === "heuristic") return finish(rulesDecisions("model unavailable, adopted by rule"), rulesNotes(), { provider: r.provider, model: r.model, latencyMs: r.latencyMs, rejections: [], error: r.error });

  const rejections: WeeklyReview["rejections"] = [];
  const decisions: WeeklyReview["decisions"] = [];
  for (const c of eligible) {
    const d = (r.data.decisions ?? []).find((x) => x.kind === c.kind);
    const action = d?.action === "adopt" || d?.action === "step" || d?.action === "hold" ? d.action : undefined;
    if (!action) { rejections.push({ what: `decision for ${c.kind}`, reason: d ? `unknown action "${d.action}"` : "missing, adopted by rule" }); decisions.push({ kind: c.kind, action: "adopt", reason: "model gave no valid decision, adopted by rule", source: "rules" }); continue; }
    decisions.push({ kind: c.kind, action, reason: (d?.reason ?? "").trim().slice(0, 140), source: "nemotron" });
  }
  for (const d of r.data.decisions ?? []) {
    const c = candidates.find((x) => x.kind === d.kind);
    if (c && !c.eligible && d.action && d.action !== "hold") rejections.push({ what: `${d.action} on ${d.kind}`, reason: "not enough evidence, held by code" });
  }

  const notes: LearningNote[] = [];
  for (const n of (r.data.notes ?? []).slice(0, 3)) {
    const kind = (KINDS_AND_GENERAL as readonly string[]).includes(n.kind ?? "") ? (n.kind as TaskKind | "general") : undefined;
    const text = (n.text ?? "").trim();
    const why = !kind ? "unknown kind" : whyNoteRejected(text, kind, candidates, week);
    if (why || !kind) {
      rejections.push({ what: `note "${text.slice(0, 80)}"`, reason: why ?? "unknown kind" });
      const c = candidates.find((x) => x.kind === kind && x.eligible) ?? eligible[0];
      if (c && !notes.some((x) => x.kind === c.kind)) notes.push(ruleNote(c, week));
      continue;
    }
    notes.push({ week, kind, text, source: "nemotron" });
  }
  return finish(decisions, notes, { provider: "nemotron-hosted", model: r.model, latencyMs: r.latencyMs, rejections });
}
