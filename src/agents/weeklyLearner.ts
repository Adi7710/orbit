import type { AspectSpec, Observation } from "@/core/aspects";
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

export type { AspectSpec, Observation };

export interface WeekMemory {
  week: number;
  /** This person's overall pace, used for any category without its own number. */
  global?: number;
  /** A category's own number, which overrides the global one. */
  multipliers: Record<string, number>;
  /** Weeks in which a category disagreed with the global pace. Code's own tally, not the model's. */
  evidence: Record<string, number>;
  /** What the model wrote to its future self, newest last. */
  memos: { week: number; text: string }[];
}
export const emptyMemory = (): WeekMemory => ({ week: 0, multipliers: {}, evidence: {}, memos: [] });

/** What the app should allow, given everything learned so far. */
export const multiplierFor = (m: WeekMemory, category: string) => m.multipliers[category] ?? m.global ?? 1;

export interface SeenItem extends Observation { planned: number }
export interface Change { category: string; from: number; to: number; reason: string; clamped: boolean }
export interface GlobalChange { from: number; to: number; reason: string }

export interface WeekLesson {
  week: number;
  /** Exactly what the model was shown. */
  sessions: SeenItem[];
  before: Record<string, number>;
  after: Record<string, number>;
  changes: Change[];
  globalChange?: GlobalChange;
  /** Exceptions the model asked for that code refused, and why. */
  refused: { category: string; reason: string }[];
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
    pace: { type: "number", description: "This person's overall pace, applied to everything without its own number." },
    memo: { type: "string", description: "One sentence to your future self about this student, under 30 words." },
  },
  required: ["multipliers", "memo"],
  additionalProperties: false,
};

/**
 * Three of these rules exist because the first live run failed without them: the
 * model flattened every category to a convenient 1.1 and then oscillated
 * 1.1 -> 1.0 -> 1.1 for eight weeks while its own memo said the opposite. Hand
 * it the arithmetic, forbid lowering a multiplier while plans run short, and
 * forbid contradicting its own memory.
 */
function systemPrompt(aspect: AspectSpec): string {
  const g = aspect.global;
  const lines = [
    `You are Orbit's weekly planner for one student. ${aspect.brief}`,
    `Each week you see only that week's records, plus your own memory from earlier weeks.`,
    `A multiplier means: minutes to allow = ${aspect.baselineNoun} times the multiplier. It starts at 1, which means the app's current number is right.`,
    `For every record you get the baseline, what you planned for it, and what it really took. You are also given ranOver, the average of actual divided by baseline, so you never have to do the division yourself: one for each ${aspect.categoryNoun} and one for the week overall.`,
  ];
  if (g) {
    lines.push(
      `This person has one ${g.noun}, and it is the main thing you are learning. If their walks come in under the allowance, their ${g.noun} is below 1 and you must say so plainly rather than leaving it at 1: the point is to show them the shorter, true number.`,
      `The ${g.noun} applies to every ${aspect.categoryNoun}, including ones they have never done before, because it is a fact about the person and not about any one route.`,
      `Give a ${aspect.categoryNoun} its own multiplier ONLY when it keeps disagreeing with the ${g.noun} week after week, which means there is a real reason for it such as a hill or a slow lift. A single odd week is noise, not a reason. Everything else should be left to the ${g.noun}.`,
      `You are told howManyWeeksItHasDisagreed for each ${aspect.categoryNoun}. Do not ask for its own multiplier until that is at least ${g.exceptionMinWeeks}.`,
    );
  } else {
    lines.push(`You decide a multiplier for each ${aspect.categoryNoun}.`);
  }
  lines.push(
    "Read the consequence of your own last decision. If ranOver is above what you planned with, your plans came in short and the number must go UP. If ranOver is below it, the number must come DOWN: do not keep padding a person who is consistently faster than the app thinks.",
    "Your memo is your memory of this student. Do not contradict it without new evidence this week.",
    "Move most of the way toward ranOver, and further when several weeks have said the same thing. One week is a small sample, so do not jump past it onto a single record.",
    `Give two decimals and a number that follows from ranOver. Do not round to a convenient 1.1 or 0.9.`,
    `Then write one sentence to your future self: what you now believe about this student, so next week you do not start over.`,
  );
  return lines.join(" ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratioOf = (xs: SeenItem[]) => round2(xs.reduce((a, s) => a + s.actual / s.estimate, 0) / xs.length);

/** What the model is shown for one week, given the plan it was working from. */
export function seenItems(week: Observation[], memory: WeekMemory, aspect: AspectSpec): SeenItem[] {
  return week
    .filter((o) => aspect.categories.includes(o.category) && o.estimate > 0 && o.actual > 0)
    .map((o) => ({ ...o, planned: round2(o.estimate * multiplierFor(memory, o.category)) }));
}

/** Weeks in which each category disagreed with the week's overall pace, carried forward. */
function tallyEvidence(seen: SeenItem[], memory: WeekMemory, aspect: AspectSpec): Record<string, number> {
  const g = aspect.global;
  if (!g) return memory.evidence;
  const overall = ratioOf(seen);
  const next = { ...memory.evidence };
  for (const category of [...new Set(seen.map((s) => s.category))]) {
    const own = ratioOf(seen.filter((s) => s.category === category));
    if (Math.abs(own - overall) > g.exceptionThreshold) next[category] = (next[category] ?? 0) + 1;
  }
  return next;
}

/**
 * The code-only learner, for comparison: move toward what this week alone
 * implies, a third of the way at a time. Same information, same one-week window,
 * no model. If Nemotron cannot beat this, it is not learning anything a running
 * average does not already capture.
 */
export const BLEND = 1 / 3;
function rulesUpdate(seen: SeenItem[], memory: WeekMemory, aspect: AspectSpec, evidence: Record<string, number>) {
  const g = aspect.global;
  const changes: Change[] = [];
  let globalChange: GlobalChange | undefined;

  if (g) {
    // The global pace is learned from every record, so a leg walked for the
    // first time inherits it instead of starting from the app's default.
    const pooled = seen.filter((s) => !memory.multipliers[s.category]);
    if (pooled.length) {
      const from = memory.global ?? 1;
      const to = round2(from + (ratioOf(pooled) - from) * BLEND);
      if (to !== from) globalChange = { from, to, reason: `this week ran ${ratioOf(pooled)}x overall` };
    }
    for (const category of [...new Set(seen.map((s) => s.category))]) {
      if ((evidence[category] ?? 0) < g.exceptionMinWeeks) continue;
      const own = ratioOf(seen.filter((s) => s.category === category));
      const from = memory.multipliers[category] ?? globalChange?.to ?? memory.global ?? 1;
      const to = round2(from + (own - from) * BLEND);
      if (to !== from) changes.push({ category, from, to, reason: `disagrees with the overall pace in ${evidence[category]} weeks`, clamped: false });
    }
    return { changes, globalChange };
  }

  for (const category of [...new Set(seen.map((s) => s.category))]) {
    const own = ratioOf(seen.filter((s) => s.category === category));
    const from = memory.multipliers[category] ?? 1;
    const to = round2(from + (own - from) * BLEND);
    if (to !== from) changes.push({ category, from, to, reason: `this week ran ${own}x`, clamped: false });
  }
  return { changes, globalChange };
}

const clampTo = (n: number, a: AspectSpec) => round2(Math.min(a.clamp?.max ?? CLAMP_MAX, Math.max(a.clamp?.min ?? CLAMP_MIN, n)));

/**
 * True when a proposed number is closer to the reciprocal of the evidence than
 * to the evidence itself. Live run, week 6: the week ran 1.18x, the memo said
 * "walks 16% slower", and the model answered 0.84, which is 1/1.18. It had
 * flipped the ratio, and the displayed walking times would have collapsed.
 */
export function isInverted(proposed: number, observed: number): boolean {
  if (Math.abs(observed - 1) < 0.05) return false;
  return Math.abs(proposed - 1 / observed) < Math.abs(proposed - observed);
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
  const g = aspect.global;

  const settle = (
    changes: Change[],
    globalChange: GlobalChange | undefined,
    memo: string,
    refused: WeekLesson["refused"],
    evidence: Record<string, number>,
    meta: Pick<WeekLesson, "provider" | "model" | "latencyMs" | "error">,
  ) => {
    // Nothing moves until enough weeks have been seen, because a displayed
    // walking time that lurches after one week is worse than one that is late.
    const warm = !g || weekNumber >= g.warmupWeeks;
    const after = { ...before };
    if (warm) for (const c of changes) after[c.category] = c.to;
    const next: WeekMemory = {
      week: weekNumber,
      global: warm && globalChange ? globalChange.to : memory.global,
      multipliers: after,
      evidence,
      memos: [...memory.memos, ...(memo ? [{ week: weekNumber, text: memo }] : [])].slice(-6),
    };
    return {
      memory: next,
      lesson: {
        week: weekNumber, sessions, before, after,
        changes: warm ? changes : [],
        globalChange: warm ? globalChange : undefined,
        refused: warm ? refused : [...refused, { category: "all", reason: `only ${weekNumber} week(s) of data, nothing changes before ${g?.warmupWeeks}` }],
        memo, ...meta,
      },
    };
  };

  const evidence = tallyEvidence(sessions, memory, aspect);
  if (sessions.length === 0) return settle([], undefined, "", [], evidence, { provider: "heuristic", latencyMs: 0 });
  if (opts.useModel === false) {
    const { changes, globalChange } = rulesUpdate(sessions, memory, aspect, evidence);
    return settle(changes, globalChange, "", [], evidence, { provider: "heuristic", latencyMs: 0 });
  }

  // The division is handed over, the decision is not.
  const perCategory = [...new Set(sessions.map((s) => s.category))].map((category) => {
    const ks = sessions.filter((s) => s.category === category);
    return {
      category,
      name: aspect.categoryLabel[category] ?? category,
      records: ks.length,
      ranOver: ratioOf(ks),
      planningWith: multiplierFor(memory, category),
      ...(g ? { hasItsOwnNumber: category in before, howManyWeeksItHasDisagreed: evidence[category] ?? 0 } : {}),
    };
  });

  const user = JSON.stringify({
    week: weekNumber,
    ...(g ? { overallRanOverThisWeek: ratioOf(sessions), [`your${g.noun.replace(/\s/g, "")}`]: memory.global ?? 1 } : {}),
    thisWeekByCategory: perCategory,
    thisWeek: sessions.map((s) => ({ what: s.label, category: s.category, baseline: s.estimate, youPlanned: s.planned, actuallyTook: s.actual })),
    yourCurrentExceptions: Object.keys(before).length ? before : "none",
    yourMemory: memory.memos.map((m) => `week ${m.week}: ${m.text}`),
  });

  type Raw = { multipliers?: { category?: string; multiplier?: number; reason?: string }[]; pace?: number; memo?: string };
  // A weekly job, so a slow answer is fine; only a hang is not.
  const r = await nemotronJson<Raw>(systemPrompt(aspect), user, schema, () => ({ multipliers: [], memo: "" }), 90000, 700);

  if (r.provider === "heuristic") {
    // Unreachable: fall back to the running average rather than freezing the plan, and say so.
    const { changes, globalChange } = rulesUpdate(sessions, memory, aspect, evidence);
    return settle(changes, globalChange, "", [], evidence, { provider: r.provider, model: r.model, latencyMs: r.latencyMs, error: r.error });
  }

  const changes: Change[] = [];
  const refused: WeekLesson["refused"] = [];
  let globalChange: GlobalChange | undefined;

  const overall = ratioOf(sessions);
  if (g && Number.isFinite(Number(r.data.pace)) && Number(r.data.pace) > 0) {
    const to = clampTo(Number(r.data.pace), aspect);
    const from = memory.global ?? 1;
    if (isInverted(to, overall)) refused.push({ category: g.noun, reason: `answered ${to} when the week ran ${overall}x, which is the ratio upside down` });
    else if (to !== from) globalChange = { from, to, reason: "overall pace" };
  }

  for (const m of r.data.multipliers ?? []) {
    const category = String(m.category ?? "");
    if (!aspect.categories.includes(category) || !sessions.some((s) => s.category === category)) continue;
    if (changes.some((c) => c.category === category)) continue;
    const raw = Number(m.multiplier);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    // An exception overrides the pace for one category, so it has to have earned it.
    if (g && !(category in before) && (evidence[category] ?? 0) < g.exceptionMinWeeks) {
      refused.push({ category, reason: `has only disagreed with the overall pace in ${evidence[category] ?? 0} week(s), needs ${g.exceptionMinWeeks}` });
      continue;
    }
    const to = clampTo(raw, aspect);
    const from = multiplierFor(memory, category);
    const own = ratioOf(sessions.filter((x) => x.category === category));
    if (isInverted(to, own)) { refused.push({ category, reason: `answered ${to} when it ran ${own}x, which is the ratio upside down` }); continue; }
    if (to === from) continue;
    changes.push({ category, from, to, reason: (m.reason ?? "").trim().slice(0, 120), clamped: to !== round2(raw) });
  }
  return settle(changes, globalChange, (r.data.memo ?? "").trim().slice(0, 300), refused, evidence, { provider: "nemotron-hosted", model: r.model, latencyMs: r.latencyMs });
}
