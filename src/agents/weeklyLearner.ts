import { nemotronJson, type Provider } from "./models";

/**
 * The incremental weekly learner: Nemotron itself is the thing that learns.
 *
 * This is deliberately different from `learner.ts`. There, code computed the
 * correction from all of history and the model only voted on it, which is why
 * plain rules matched it: the model was not doing the learning. Here:
 *
 *  - It sees **one week only**, never the whole history.
 *  - It sees **the consequence of its own last decision** (what it planned last
 *    week against what actually happened), so it can correct itself.
 *  - It carries its own **memory**: the multipliers it chose and a memo it wrote
 *    to its future self. That memory is the learning.
 *  - **It produces the number.** Code only clamps it to a sane range, so what is
 *    being measured is the model's judgement, not arithmetic wearing its name.
 *
 * One learner serves every aspect. An `AspectSpec` supplies the nouns and the
 * categories, and only that aspect's observations are ever shown, because the
 * model is being trained on one aspect at a time and nothing else.
 */

/** Safety rail only, wide enough that the model's judgement is what gets measured. */
export const CLAMP_MIN = 0.4;
export const CLAMP_MAX = 3;

/** One thing that happened: what the app allowed for it, and what it really took. */
export interface Observation {
  label: string;
  /** What the multiplier is learned per: a kind of work, a walking leg. */
  category: string;
  /** The minutes the app would allow before any learning. */
  estimate: number;
  actual: number;
}

export interface AspectSpec {
  id: string;
  /** "kind of work", "walk between two buildings". */
  categoryNoun: string;
  /** What the multiplier scales. */
  baselineNoun: string;
  /** Two sentences telling the model what it is planning and why it matters. */
  brief: string;
  categories: string[];
  categoryLabel: Record<string, string>;
}

export interface WeekMemory {
  week: number;
  /** What to multiply the baseline by, per category. */
  multipliers: Record<string, number>;
  /** What the model wrote to its future self, newest last. */
  memos: { week: number; text: string }[];
}
export const emptyMemory = (): WeekMemory => ({ week: 0, multipliers: {}, memos: [] });

export interface SeenItem extends Observation { planned: number }
export interface Change { category: string; from: number; to: number; reason: string; clamped: boolean }

export interface WeekLesson {
  week: number;
  /** Exactly what the model was shown. */
  sessions: SeenItem[];
  before: Record<string, number>;
  after: Record<string, number>;
  changes: Change[];
  memo: string;
  provider: Provider;
  model?: string;
  latencyMs: number;
  error?: string;
}

const schema = {
  type: "object",
  properties: {
    multipliers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          multiplier: { type: "number" },
          reason: { type: "string", description: "At most 12 words." },
        },
        required: ["category", "multiplier", "reason"],
        additionalProperties: false,
      },
    },
    memo: { type: "string", description: "One sentence to your future self about this student, under 30 words." },
  },
  required: ["multipliers", "memo"],
  additionalProperties: false,
};

/**
 * Three of these lines exist because the first live run failed without them: the
 * model flattened every category to a convenient 1.1 and then oscillated
 * 1.1 -> 1.0 -> 1.1 for eight weeks while its own memo said the opposite. Hand
 * it the arithmetic, forbid lowering a multiplier while plans run short, and
 * forbid contradicting its own memory.
 */
function systemPrompt(aspect: AspectSpec): string {
  return [
    `You are Orbit's weekly planner for one student. ${aspect.brief}`,
    `Each week you see only that week's records, plus your own memory from earlier weeks. You decide a multiplier for each ${aspect.categoryNoun}.`,
    `A multiplier means: minutes to allow = ${aspect.baselineNoun} times the multiplier. It starts at 1, which means the app's current number is right.`,
    `For every record you get the baseline, what you planned for it, and what it really took. For each ${aspect.categoryNoun} you are also given ranOver, the average of actual divided by baseline this week, so you never have to do the division yourself.`,
    "Read the consequence of your own last decision. If ranOver is above your current multiplier, your plans came in short and the multiplier must go UP, never down. If ranOver is below it, the multiplier may come down.",
    "Your memo is your memory of this student. Do not contradict it: if it says they run long on something, do not lower that multiplier unless this week's ranOver is genuinely below it.",
    "Move most of the way toward ranOver, and further when several weeks have said the same thing. One week is a small sample, so do not jump past it onto a single record.",
    `Give two decimals and a number that follows from ranOver. Do not round to a convenient 1.1 or 1.5, and do not give every ${aspect.categoryNoun} the same multiplier unless their ranOver really is the same.`,
    `Return a multiplier for every ${aspect.categoryNoun} in this week's records, and only those. Then write one sentence to your future self: what you now believe about this student, ${aspect.categoryNoun} by ${aspect.categoryNoun}, so next week you do not start over.`,
  ].join(" ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the model is shown for one week, given the plan it was working from. */
export function seenItems(week: Observation[], memory: WeekMemory, aspect: AspectSpec): SeenItem[] {
  return week
    .filter((o) => aspect.categories.includes(o.category) && o.estimate > 0 && o.actual > 0)
    .map((o) => ({ ...o, planned: round2(o.estimate * (memory.multipliers[o.category] ?? 1)) }));
}

/**
 * The code-only learner, for comparison: move the current multiplier a third of
 * the way toward what this week alone implies. Same information, same one-week
 * window, no model. If Nemotron cannot beat this, it is not learning anything a
 * running average does not already capture.
 */
export const BLEND = 1 / 3;
function rulesUpdate(seen: SeenItem[], memory: WeekMemory): Change[] {
  const out: Change[] = [];
  for (const category of [...new Set(seen.map((s) => s.category))]) {
    const ks = seen.filter((s) => s.category === category);
    const ranOver = ks.reduce((a, s) => a + s.actual / s.estimate, 0) / ks.length;
    const from = memory.multipliers[category] ?? 1;
    const to = round2(from + (ranOver - from) * BLEND);
    if (to !== from) out.push({ category, from, to, reason: `this week ran ${round2(ranOver)}x`, clamped: false });
  }
  return out;
}

export async function learnFromWeek(
  week: Observation[],
  memory: WeekMemory,
  weekNumber: number,
  aspect: AspectSpec,
  opts: { useModel?: boolean } = {},
): Promise<{ memory: WeekMemory; lesson: WeekLesson }> {
  const sessions = seenItems(week, memory, aspect);
  const before = { ...memory.multipliers };

  const settle = (changes: Change[], memo: string, meta: Pick<WeekLesson, "provider" | "model" | "latencyMs" | "error">) => {
    const after = { ...before };
    for (const c of changes) after[c.category] = c.to;
    const next: WeekMemory = { week: weekNumber, multipliers: after, memos: [...memory.memos, ...(memo ? [{ week: weekNumber, text: memo }] : [])].slice(-6) };
    return { memory: next, lesson: { week: weekNumber, sessions, before, after, changes, memo, ...meta } };
  };

  if (sessions.length === 0) return settle([], "", { provider: "heuristic", latencyMs: 0 });
  if (opts.useModel === false) return settle(rulesUpdate(sessions, memory), "", { provider: "heuristic", latencyMs: 0 });

  // The division is handed over, the decision is not.
  const perCategory = [...new Set(sessions.map((s) => s.category))].map((category) => {
    const ks = sessions.filter((s) => s.category === category);
    return {
      category,
      name: aspect.categoryLabel[category] ?? category,
      records: ks.length,
      ranOver: round2(ks.reduce((a, s) => a + s.actual / s.estimate, 0) / ks.length),
      yourMultiplier: before[category] ?? 1,
    };
  });

  const user = JSON.stringify({
    week: weekNumber,
    thisWeekByCategory: perCategory,
    thisWeek: sessions.map((s) => ({ what: s.label, category: s.category, baseline: s.estimate, youPlanned: s.planned, actuallyTook: s.actual })),
    yourCurrentMultipliers: Object.keys(before).length ? before : "none yet, you are starting from 1",
    yourMemory: memory.memos.map((m) => `week ${m.week}: ${m.text}`),
  });

  type Raw = { multipliers?: { category?: string; multiplier?: number; reason?: string }[]; memo?: string };
  // A weekly job, so a slow answer is fine; only a hang is not.
  const r = await nemotronJson<Raw>(systemPrompt(aspect), user, schema, () => ({ multipliers: [], memo: "" }), 90000, 700);

  if (r.provider === "heuristic") {
    // Unreachable: fall back to the running average rather than freezing the plan, and say so.
    return settle(rulesUpdate(sessions, memory), "", { provider: r.provider, model: r.model, latencyMs: r.latencyMs, error: r.error });
  }

  const changes: Change[] = [];
  for (const m of r.data.multipliers ?? []) {
    const category = String(m.category ?? "");
    if (!aspect.categories.includes(category) || !sessions.some((s) => s.category === category)) continue;
    if (changes.some((c) => c.category === category)) continue;
    const raw = Number(m.multiplier);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const to = round2(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, raw)));
    const from = before[category] ?? 1;
    if (to === from) continue;
    changes.push({ category, from, to, reason: (m.reason ?? "").trim().slice(0, 120), clamped: to !== round2(raw) });
  }
  return settle(changes, (r.data.memo ?? "").trim().slice(0, 300), { provider: "nemotron-hosted", model: r.model, latencyMs: r.latencyMs });
}
