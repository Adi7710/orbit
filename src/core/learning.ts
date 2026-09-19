import type { HabitRecord } from "./habits";

/**
 * The weekly learning loop, arithmetic only. Once a week the app looks at what a
 * student's work really took against what was planned, and proposes small
 * corrections per kind of work. A model may DECIDE which corrections to adopt,
 * but every number a correction carries is computed here, so the model cannot
 * make the plan worse by inventing one. Nothing in this file touches the network.
 */
export type TaskKind = "big_assignment" | "assignment" | "lab" | "reading" | "exam_prep" | "other";
export const TASK_KINDS: TaskKind[] = ["big_assignment", "assignment", "lab", "reading", "exam_prep", "other"];
export const KIND_LABEL: Record<TaskKind, string> = { big_assignment: "big assignments", assignment: "assignments", lab: "lab reports", reading: "readings", exam_prep: "exam studying", other: "other tasks" };

/** From the title and the student's own estimate. An assignment of 90+ minutes counts as big. */
export function taskKind(title: string, estimateMinutes: number): TaskKind {
  const s = title.toLowerCase();
  if (/(exam|midterm|final)/.test(s)) return "exam_prep";
  if (/\blab\b/.test(s)) return "lab";
  if (/(essay|paper|project|report)/.test(s)) return "big_assignment";
  if (/(problem set|pset|homework|\bhw\b|assignment)/.test(s)) return estimateMinutes >= 90 ? "big_assignment" : "assignment";
  if (/(reading|read|chapter)/.test(s)) return "reading";
  return "other";
}

export interface Multiplier { value: number; /** sessions it was learned from */ n: number; /** week it last changed */ since: number }
export interface LearningNote { week: number; kind: TaskKind | "general"; text: string; source: "nemotron" | "rules" }
export interface LearnedProfile {
  /** Bumped every time a weekly review changes anything. */
  version: number;
  /** The last week that has been reviewed. */
  week: number;
  multipliers: Partial<Record<TaskKind, Multiplier>>;
  notes: LearningNote[];
}
export const emptyProfile = (): LearnedProfile => ({ version: 0, week: 0, multipliers: {}, notes: [] });

/** What the app plans for a task, given what it has learned. With nothing learned it is the student's own estimate. */
export function planMinutes(estimateMinutes: number, kind: TaskKind, learned: LearnedProfile): number {
  return Math.max(1, Math.round(estimateMinutes * (learned.multipliers[kind]?.value ?? 1)));
}

/** Fewest sessions of a kind before the app changes its mind about it. */
export const MIN_SAMPLES = 2;
/** Corrections smaller than this are noise. 0.05 stalled: a kind adopted early at n=2 never moved again once its target crept within 0.05. */
export const MIN_DELTA = 0.03;
/** How hard a small sample is pulled back toward "the student's estimate is right". */
export const SHRINK_K = 1;
export const MULT_MIN = 0.6;
export const MULT_MAX = 2;

export interface Candidate {
  kind: TaskKind;
  n: number;
  /** actual / estimate over every session of this kind so far. */
  meanRatio: number;
  /** meanRatio per week, oldest first, for the weeks that had this kind (so drift is visible). */
  weeklyRatio: { week: number; ratio: number; n: number }[];
  current: number;
  /** The shrunk, clamped multiplier the code would adopt. */
  target: number;
  delta: number;
  /** Enough evidence to act on: n >= MIN_SAMPLES and |delta| >= MIN_DELTA. */
  eligible: boolean;
  /** Computed here, never by the model: first half of the weeks against the second half. "unclear" under three weeks. */
  trend: "up" | "down" | "flat" | "unclear";
  /** The most recent session of this kind, so a note can say "planned 90, took 114". */
  example: { title: string; estimate: number; actual: number; week: number };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The kind a logged session belongs to. Uses the recorded kind when present, otherwise the title. */
export const kindOf = (r: HabitRecord & { kind?: TaskKind }): TaskKind => r.kind ?? taskKind(r.title, r.plannedMinutes);

/** Everything the weekly review is allowed to argue about, computed from history up to and including `throughWeek`. */
export function weeklyCandidates(history: HabitRecord[], learned: LearnedProfile, throughWeek: number): Candidate[] {
  const rows = history.filter((r) => (r.week ?? 0) <= throughWeek && r.plannedMinutes > 0 && r.actualMinutes > 0);
  const out: Candidate[] = [];
  for (const kind of TASK_KINDS) {
    const ks = rows.filter((r) => kindOf(r) === kind);
    if (ks.length === 0) continue;
    const ratios = ks.map((r) => r.actualMinutes / r.plannedMinutes);
    const m = mean(ratios);
    const weeks = [...new Set(ks.map((r) => r.week ?? 0))].sort((a, b) => a - b);
    const weeklyRatio = weeks.map((w) => {
      const wk = ks.filter((r) => (r.week ?? 0) === w).map((r) => r.actualMinutes / r.plannedMinutes);
      return { week: w, ratio: r3(mean(wk)), n: wk.length };
    });
    const current = learned.multipliers[kind]?.value ?? 1;
    const target = r3(clamp((ks.length * m + SHRINK_K) / (ks.length + SHRINK_K), MULT_MIN, MULT_MAX));
    const delta = r3(target - current);
    const half = Math.floor(weeklyRatio.length / 2);
    const diff = weeklyRatio.length >= 3 ? mean(weeklyRatio.slice(-Math.max(1, half)).map((w) => w.ratio)) - mean(weeklyRatio.slice(0, Math.max(1, half)).map((w) => w.ratio)) : 0;
    const trend: Candidate["trend"] = weeklyRatio.length < 3 ? "unclear" : diff > 0.05 ? "up" : diff < -0.05 ? "down" : "flat";
    const last = [...ks].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime()).at(-1)!;
    out.push({
      kind, n: ks.length, meanRatio: r3(m), weeklyRatio, current: r3(current), target, delta,
      eligible: ks.length >= MIN_SAMPLES && Math.abs(delta) >= MIN_DELTA,
      trend,
      example: { title: last.title, estimate: last.plannedMinutes, actual: last.actualMinutes, week: last.week ?? 0 },
    });
  }
  return out;
}

export type Action = "adopt" | "step" | "hold";
export interface Decision { kind: TaskKind; action: Action; reason: string }

/** Apply decisions to a profile. adopt = jump to the target, step = go halfway, hold = leave it. Ineligible candidates are always held. */
export function applyDecisions(learned: LearnedProfile, candidates: Candidate[], decisions: Decision[], week: number, notes: LearningNote[] = []): LearnedProfile {
  const next: LearnedProfile = { ...learned, week, multipliers: { ...learned.multipliers }, notes: [...learned.notes, ...notes] };
  let changed = false;
  for (const c of candidates) {
    const d = decisions.find((x) => x.kind === c.kind);
    if (!d || d.action === "hold" || !c.eligible) continue;
    const value = d.action === "adopt" ? c.target : r3(c.current + (c.target - c.current) / 2);
    if (value === c.current) continue;
    next.multipliers[c.kind] = { value, n: c.n, since: week };
    changed = true;
  }
  if (changed) next.version = learned.version + 1;
  return next;
}

/** The plan-versus-actual scorecard for a set of sessions. */
export interface Score {
  sessions: number;
  /** Mean absolute error in minutes. */
  mae: number;
  /** Mean of (plan - actual). Negative means the plan was too short. */
  bias: number;
  /** Share of sessions where the plan was more than 10% short. */
  underPlanned: number;
  /** Total minutes by which plans fell short of what the work took. */
  minutesShort: number;
}

export function scorePlans(pairs: { plan: number; actual: number }[]): Score {
  if (pairs.length === 0) return { sessions: 0, mae: 0, bias: 0, underPlanned: 0, minutesShort: 0 };
  const errs = pairs.map((p) => p.plan - p.actual);
  return {
    sessions: pairs.length,
    mae: Math.round(mean(errs.map(Math.abs)) * 10) / 10,
    bias: Math.round(mean(errs) * 10) / 10,
    underPlanned: Math.round((pairs.filter((p) => p.plan < p.actual * 0.9).length / pairs.length) * 100) / 100,
    minutesShort: Math.round(pairs.reduce((s, p) => s + Math.max(0, p.actual - p.plan), 0)),
  };
}
