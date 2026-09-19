import { KIND_LABEL, type TaskKind } from "@/core/learning";
import type { HabitRecord } from "@/core/habits";
import { kindOf } from "@/core/learning";
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
 *    week against what the work actually took), so it can correct itself.
 *  - It carries its own **memory**: the multipliers it chose and a memo it wrote
 *    to its future self. That memory is the learning.
 *  - **It produces the number.** Code only clamps it to a sane range, so what is
 *    being measured is the model's judgement, not arithmetic wearing its name.
 *
 * Scope: one aspect at a time. The caller passes the kinds of work under test
 * and nothing else is shown to the model, because it is being trained on those
 * aspects and nothing else.
 */

/** Safety rail only, wide enough that the model's judgement is what gets measured. */
export const CLAMP_MIN = 0.4;
export const CLAMP_MAX = 3;

export interface WeekMemory {
  week: number;
  /** What to multiply the student's own estimate by, per kind of work. */
  multipliers: Partial<Record<TaskKind, number>>;
  /** What the model wrote to its future self, newest last. */
  memos: { week: number; text: string }[];
}
export const emptyMemory = (): WeekMemory => ({ week: 0, multipliers: {}, memos: [] });

export interface SeenSession { title: string; kind: TaskKind; estimate: number; planned: number; actual: number }
export interface Change { kind: TaskKind; from: number; to: number; reason: string; clamped: boolean }

export interface WeekLesson {
  week: number;
  /** Exactly what the model was shown. */
  sessions: SeenSession[];
  before: Partial<Record<TaskKind, number>>;
  after: Partial<Record<TaskKind, number>>;
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
          kind: { type: "string" },
          multiplier: { type: "number", description: "Minutes to plan = the student's own estimate times this." },
          reason: { type: "string", description: "At most 12 words." },
        },
        required: ["kind", "multiplier", "reason"],
        additionalProperties: false,
      },
    },
    memo: { type: "string", description: "One sentence to your future self about this student, under 25 words." },
  },
  required: ["multipliers", "memo"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are Orbit's weekly planner for one student. Each week you see only that week's finished work, plus your own memory from earlier weeks. You decide how many minutes Orbit should plan for each kind of work next week.",
  "A multiplier means: minutes to plan = the student's own estimate times the multiplier. It starts at 1, which means trusting their estimate.",
  "For every session you get the student's estimate, what you planned for it, and how many minutes it really took. For each kind of work you are also given ranOver, the average of actual divided by estimate for that kind this week, so you never have to do the division yourself.",
  "Read the consequence of your own last decision. If ranOver for a kind is above your current multiplier, your plans came in short and the multiplier must go UP, never down. If ranOver is below it, the multiplier may come down.",
  "Your memo is your memory of this student. Do not contradict it: if it says they run long on a kind of work, do not lower that multiplier unless this week's ranOver is genuinely below it.",
  "Move most of the way toward ranOver, and further when several weeks have said the same thing. One week is a small sample, so do not jump past it onto a single session.",
  "Give two decimals and a number that follows from ranOver. Do not round to a convenient 1.1 or 1.5, and do not give every kind of work the same multiplier unless their ranOver really is the same.",
  "Return a multiplier for every kind of work in this week's sessions, and only those kinds. Then write one sentence to your future self: what you now believe about this student, per kind of work, so next week you do not start over.",
].join(" ");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the model is shown for one week, given the plan it was working from. */
export function seenSessions(weekSessions: HabitRecord[], memory: WeekMemory, kinds: TaskKind[]): SeenSession[] {
  return weekSessions
    .filter((r) => kinds.includes(kindOf(r)) && r.plannedMinutes > 0 && r.actualMinutes > 0)
    .map((r) => {
      const kind = kindOf(r);
      return {
        title: r.title,
        kind,
        estimate: r.plannedMinutes,
        planned: Math.round(r.plannedMinutes * (memory.multipliers[kind] ?? 1)),
        actual: r.actualMinutes,
      };
    });
}

/**
 * The code-only learner, for comparison: move the current multiplier a third of
 * the way toward what this week alone implies. Same information, same one-week
 * window, no model. If Nemotron cannot beat this, it is not learning anything
 * a running average does not already capture.
 */
export const BLEND = 1 / 3;
function rulesUpdate(seen: SeenSession[], memory: WeekMemory): Change[] {
  const out: Change[] = [];
  for (const kind of [...new Set(seen.map((s) => s.kind))]) {
    const ks = seen.filter((s) => s.kind === kind);
    const weekRatio = ks.reduce((a, s) => a + s.actual / s.estimate, 0) / ks.length;
    const from = memory.multipliers[kind] ?? 1;
    const to = round2(from + (weekRatio - from) * BLEND);
    if (to !== from) out.push({ kind, from, to, reason: `this week ran ${round2(weekRatio)}x`, clamped: false });
  }
  return out;
}

export async function learnFromWeek(
  weekSessions: HabitRecord[],
  memory: WeekMemory,
  week: number,
  kinds: TaskKind[],
  opts: { useModel?: boolean } = {},
): Promise<{ memory: WeekMemory; lesson: WeekLesson }> {
  const sessions = seenSessions(weekSessions, memory, kinds);
  const before = { ...memory.multipliers };

  const settle = (changes: Change[], memo: string, meta: Pick<WeekLesson, "provider" | "model" | "latencyMs" | "error">) => {
    const after = { ...before };
    for (const c of changes) after[c.kind] = c.to;
    const next: WeekMemory = { week, multipliers: after, memos: [...memory.memos, ...(memo ? [{ week, text: memo }] : [])].slice(-6) };
    return { memory: next, lesson: { week, sessions, before, after, changes, memo, ...meta } };
  };

  if (sessions.length === 0) return settle([], "", { provider: "heuristic", latencyMs: 0 });

  if (opts.useModel === false) {
    const changes = rulesUpdate(sessions, memory);
    return settle(changes, "", { provider: "heuristic", latencyMs: 0 });
  }

  // The division is handed over, the decision is not: models are unreliable at
  // arithmetic and the first live run showed it, flattening every kind to 1.1
  // and then oscillating 1.1 -> 1.0 -> 1.1 for eight weeks.
  const perKind = [...new Set(sessions.map((s) => s.kind))].map((kind) => {
    const ks = sessions.filter((s) => s.kind === kind);
    return {
      kind,
      kindOfWork: KIND_LABEL[kind],
      sessions: ks.length,
      ranOver: round2(ks.reduce((a, s) => a + s.actual / s.estimate, 0) / ks.length),
      yourMultiplier: before[kind] ?? 1,
    };
  });

  const user = JSON.stringify({
    week,
    thisWeekByKind: perKind,
    thisWeek: sessions.map((s) => ({ task: s.title, kindOfWork: KIND_LABEL[s.kind], kind: s.kind, studentEstimate: s.estimate, youPlanned: s.planned, actuallyTook: s.actual })),
    yourCurrentMultipliers: Object.keys(before).length ? before : "none yet, you are starting from 1",
    yourMemory: memory.memos.map((m) => `week ${m.week}: ${m.text}`),
  });

  type Raw = { multipliers?: { kind?: string; multiplier?: number; reason?: string }[]; memo?: string };
  // A weekly job, so a slow answer is fine; only a hang is not.
  const r = await nemotronJson<Raw>(SYSTEM, user, schema, () => ({ multipliers: [], memo: "" }), 90000, 700);

  if (r.provider === "heuristic") {
    // The model could not be reached. Fall back to the running average rather
    // than freezing the plan, and say so.
    const changes = rulesUpdate(sessions, memory);
    return settle(changes, "", { provider: r.provider, model: r.model, latencyMs: r.latencyMs, error: r.error });
  }

  const changes: Change[] = [];
  for (const m of r.data.multipliers ?? []) {
    const kind = m.kind as TaskKind;
    if (!kinds.includes(kind) || !sessions.some((s) => s.kind === kind)) continue;
    if (changes.some((c) => c.kind === kind)) continue;
    const raw = Number(m.multiplier);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const to = round2(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, raw)));
    const from = before[kind] ?? 1;
    if (to === from) continue;
    changes.push({ kind, from, to, reason: (m.reason ?? "").trim().slice(0, 120), clamped: to !== round2(raw) });
  }
  return settle(changes, (r.data.memo ?? "").trim().slice(0, 300), { provider: "nemotron-hosted", model: r.model, latencyMs: r.latencyMs });
}
