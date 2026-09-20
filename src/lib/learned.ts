import type { HabitRecord } from "@/core/habits";
import { ASPECTS, DEFAULTS, bucketOfSession, gapBand, specFor, type AspectId, type LearningInput, type WeeklyObservation } from "@/core/aspects";
import { Estimator } from "@/core/estimator";
import { kindOf, taskKind } from "@/core/learning";
import type { Domain, Task } from "@/core/types";
import { emptyMemory, learnFromWeek, multiplierFor, type WeekLesson, type WeekMemory } from "@/agents/weeklyLearner";
import { log, store } from "./store";

/**
 * What Orbit has learned about this student, and how the rest of the app reads it.
 *
 * The weekly review runs every aspect in the registry over the week that just
 * ended. Each aspect keeps its own memory: the multipliers it settled on and a
 * memo the model wrote to its future self, which is what lets the next week
 * continue rather than start over.
 *
 * Everything below degrades to the app's original behaviour. An aspect with too
 * little evidence returns a multiplier of 1, so a brand new user gets exactly
 * the app as it was, and the learning only ever shows up as a correction.
 */
export interface AspectState {
  memory: WeekMemory;
  observations: number;
  /** True once there is enough evidence for the app to act on it. */
  active: boolean;
  lastReviewedWeek: number;
  lessons: WeekLesson[];
}
export interface LearnedStore {
  /** Whose profile this is. Learning is never shared between users. */
  userId: string;
  epoch: string;
  aspects: Record<string, AspectState>;
  lastReviewedWeek: number;
}

/**
 * One learned profile per person, keyed by user id. Nothing here is shared
 * between users and nothing is a constant: every multiplier is derived from
 * that person's own completions, so two students with the same tasks end up
 * with different numbers, different planned minutes and different sentences.
 */
const g = globalThis as unknown as { __orbitLearned?: Record<string, LearnedStore> };
const allLearned = () => (g.__orbitLearned ??= {});

const DAY = 864e5;
/** Week 1 is the week containing the epoch. */
export const weekIndex = (at: Date, epoch: Date) => Math.max(1, Math.floor((at.getTime() - epoch.getTime()) / (7 * DAY)) + 1);

function epochOf(): Date {
  const s = store();
  const times = s.habits.map((h) => h.completedAt.getTime()).filter((t) => Number.isFinite(t));
  return new Date(times.length ? Math.min(...times) : Date.now());
}

/** The profile of whoever the app is currently acting for. */
export function learned(userId = store().user.id): LearnedStore {
  const all = allLearned();
  return (all[userId] ??= { userId, epoch: epochOf().toISOString(), aspects: {}, lastReviewedWeek: 0 });
}

/** Forget one person, or everyone. Used by the demo reset and by tests. */
export function resetLearned(userId?: string) {
  if (userId) delete allLearned()[userId];
  else g.__orbitLearned = undefined;
}

/** Every profile the server is holding, so it is visible that they are separate. */
export const knownUsers = () => Object.keys(allLearned());

function stateOf(id: AspectId): AspectState {
  const l = learned();
  return (l.aspects[id] ??= { memory: emptyMemory(), observations: 0, active: false, lastReviewedWeek: 0, lessons: [] });
}

/** The current week, counted from the first thing the app ever recorded. */
export const currentWeek = () => weekIndex(new Date(), new Date(learned().epoch));

// MARK: - Turning what the app records into evidence

/**
 * Everything any aspect might learn from, assembled from the live store. An
 * aspect whose signal the app does not yet record simply collects nothing and
 * stays inactive, which is how a new aspect can be registered before the data
 * that feeds it exists.
 */
export function buildLearningInput(): LearningInput {
  const s = store();
  const epoch = new Date(learned().epoch);
  const wk = (d: Date) => weekIndex(d, epoch);

  const habits = s.habits.map((h) => ({ ...h, week: h.week ?? wk(h.completedAt) }));

  const proposals = s.proposals
    .filter((p) => p.status !== "pending")
    .map((p) => ({ week: wk(new Date(p.resolvedAt ?? p.createdAt)), kind: p.proposal.kind as string, approved: p.status === "approved" }));

  // Follow-through: of the tasks due in a week, how many were actually finished.
  const byWeek = new Map<string, { week: number; domain: Domain; offered: number; done: number }>();
  for (const t of s.tasks) {
    if (!t.dueAt) continue;
    const week = wk(t.dueAt);
    const key = `${week}|${t.domain}`;
    const e = byWeek.get(key) ?? { week, domain: t.domain, offered: 0, done: 0 };
    e.offered++;
    if (t.completedAt) e.done++;
    byWeek.set(key, e);
  }

  // Each aspect learns the residual left by the ones it sits on top of.
  const baseline = (r: HabitRecord, forAspect: string) => {
    const onTopOf = ASPECTS[forAspect]?.onTopOf ?? [];
    let m = 1;
    if (onTopOf.includes("work_length")) m *= factor("work_length", taskKind(r.title, r.plannedMinutes));
    if (onTopOf.includes("course_load") && r.courseCode) m *= factor("course_load", r.courseCode);
    return Math.max(1, r.plannedMinutes * m);
  };

  return { habits, proposals, scheduled: [...byWeek.values()], baseline };
}

// MARK: - The weekly review

export interface ReviewResult {
  week: number;
  aspects: { id: string; label: string; observations: number; active: boolean; changed: string[]; memo: string; provider: string; latencyMs: number; error?: string }[];
}

/**
 * Run every aspect over one week. Aspects are independent, so one that fails or
 * has no data never stops the others.
 */
export async function reviewWeek(week: number, opts: { useModel?: boolean } = {}): Promise<ReviewResult> {
  const input = buildLearningInput();
  const out: ReviewResult["aspects"] = [];

  for (const [id, def] of Object.entries(ASPECTS)) {
    let all: WeeklyObservation[] = [];
    try {
      all = def.collect(input);
    } catch (e) {
      out.push({ id, label: def.label, observations: 0, active: false, changed: [], memo: "", provider: "none", latencyMs: 0, error: `collect failed: ${(e as Error).message}` });
      continue;
    }
    const st = stateOf(id);
    st.observations = all.length;
    const thisWeek = all.filter((o) => o.week === week);
    if (thisWeek.length === 0) {
      out.push({ id, label: def.label, observations: all.length, active: st.active, changed: [], memo: "", provider: "none", latencyMs: 0 });
      continue;
    }

    try {
      const spec = specFor(id, all);
      const { memory, lesson } = await learnFromWeek(thisWeek, st.memory, week, spec, opts);
      st.memory = memory;
      st.lastReviewedWeek = week;
      st.lessons = [...st.lessons, lesson].slice(-12);
      st.active = all.length >= def.minObservations && (memory.global !== undefined || Object.keys(memory.multipliers).length > 0);
      out.push({
        id, label: def.label, observations: all.length, active: st.active,
        changed: [
          ...(lesson.globalChange ? [`${spec.global?.noun ?? "overall"} ${lesson.globalChange.from} to ${lesson.globalChange.to}`] : []),
          ...lesson.changes.map((c) => `${spec.categoryLabel[c.category] ?? c.category} ${c.from} to ${c.to}`),
        ],
        memo: lesson.memo,
        provider: lesson.provider,
        latencyMs: lesson.latencyMs,
        error: lesson.error,
      });
    } catch (e) {
      out.push({ id, label: def.label, observations: all.length, active: st.active, changed: [], memo: "", provider: "none", latencyMs: 0, error: (e as Error).message });
    }
  }

  learned().lastReviewedWeek = week;
  log("agent", "weekly_review", { week, aspects: out.map((a) => ({ id: a.id, changed: a.changed.length, provider: a.provider })) });
  return { week, aspects: out };
}

/** Catch up from whatever was last reviewed to the week that just ended. */
export async function reviewUpTo(week: number, opts: { useModel?: boolean } = {}): Promise<ReviewResult[]> {
  const from = Math.max(1, learned().lastReviewedWeek + 1);
  const out: ReviewResult[] = [];
  for (let w = from; w <= week; w++) out.push(await reviewWeek(w, opts));
  return out;
}

// MARK: - What the app reads

/** The learned multiplier, or 1 when this aspect has not earned the right to speak yet. */
export function factor(id: AspectId, category: string): number {
  const st = learned().aspects[id];
  if (!st?.active) return 1;
  return multiplierFor(st.memory, category);
}

export const isActive = (id: AspectId) => !!learned().aspects[id]?.active;

/**
 * How many minutes to plan for a task. Three learned corrections compose here:
 * the kind of work, the course it belongs to, and, when the gap is known, the
 * time of day and how well this person uses a gap that size.
 */
export function planningMinutes(task: Task, gap?: { start: number; usable: number }): number {
  const base = task.estimateMinutes;
  let m = factor("work_length", taskKind(task.title, base));
  if (task.courseCode) m *= factor("course_load", task.courseCode);
  if (gap) {
    m *= factor("gap_fit", gapBand(gap.usable));
    m *= factor("time_of_day", gap.start < 12 * 60 ? "morning" : gap.start < 17 * 60 ? "midday" : gap.start < 22 * 60 ? "evening" : "late");
  }
  return Math.max(1, Math.round(base * m));
}

/**
 * An Estimator the rest of the app can pass around unchanged, which uses what
 * has been learned when there is enough of it and the original calibration
 * otherwise. The two are never multiplied together: they are learned from the
 * same completions, so stacking them would count the same correction twice.
 */
class PlanningEstimator extends Estimator {
  constructor(private readonly base: Estimator, private readonly gap?: { start: number; usable: number }) {
    super();
  }
  override planningMinutes(task: Task): number {
    return isActive("work_length") ? planningMinutes(task, this.gap) : this.base.planningMinutes(task);
  }
}
export const planner = (base: Estimator, gap?: { start: number; usable: number }) => new PlanningEstimator(base, gap);

/** Minutes to allow for a walk, correcting the app's own number with this person's pace. */
export const walkMinutes = (base: number, leg: string) => Math.max(1, Math.round(base * factor("walking", leg) * 10) / 10);
export const settleMinutes = () => Math.max(1, Math.round(DEFAULTS.settleMinutes * factor("settle_in", "settle")));
export const mealMinutes = () => Math.max(5, Math.round(DEFAULTS.mealMinutes * factor("meals", "meal")));

/**
 * Whether a deadline is likely to survive how late this person starts. Needs
 * both halves: when they begin, and how long the work will really hold them.
 * That pairing is the whole point of learning more than one aspect.
 */
export function deadlineRisk(task: Task): { atRisk: boolean; startsInHours: number; needsMinutes: number } | undefined {
  if (!task.dueAt || !isActive("procrastination")) return undefined;
  const kind = taskKind(task.title, task.estimateMinutes);
  const startsInHours = Math.round(DEFAULTS.leadHours * factor("procrastination", kind) * 10) / 10;
  const needsMinutes = planningMinutes(task);
  return { atRisk: startsInHours * 60 < needsMinutes, startsInHours, needsMinutes };
}

/** Below this, Orbit stops spending someone's gaps on something they never do. */
export const OFFER_FLOOR = 0.35;
export const worthOffering = (domain: Domain) => !isActive("follow_through") || factor("follow_through", domain) >= OFFER_FLOOR;
export const worthProposing = (kind: string) => !isActive("proposal_fit") || factor("proposal_fit", kind) >= OFFER_FLOOR;

// MARK: - Reading it back

export interface LearnedFact {
  aspect: string;
  label: string;
  effect: string;
  category: string;
  categoryLabel: string;
  multiplier: number;
  /** Plain words, written by code so the direction can never disagree with the number. */
  sentence: string;
  /** Who produced the multiplier in the last review of this aspect: "nemotron-hosted" or "heuristic". Shown on screen, so the credit is exact. */
  learnedBy: string;
  /** The last memo the model wrote to itself about this aspect, if it was the model. */
  memo?: string;
}

const pct = (m: number) => Math.round(Math.abs(m - 1) * 100);

/**
 * Sentences are written here, not by the model. In two aspects the model
 * described its own numbers backwards ("completes big assignments quickly" for
 * the student who starts them last), so the wording is derived from the
 * multiplier and cannot disagree with it.
 */
function sentenceFor(id: string, label: string, m: number): string {
  const more = m > 1;
  switch (id) {
    case "work_length": return `${label} take you about ${pct(m)}% ${more ? "longer" : "less"} than you think.`;
    case "course_load": return `${label} costs you about ${pct(m)}% ${more ? "more" : "less"} time than your other work.`;
    case "procrastination": return `You start ${label} about ${Math.round(DEFAULTS.leadHours * m * 10) / 10} hours before they are due.`;
    case "time_of_day": return `You work about ${pct(m)}% ${more ? "slower" : "faster"} ${label}.`;
    case "gap_fit": return `In ${label} you get through about ${pct(m)}% ${more ? "less" : "more"} than the time suggests.`;
    case "walking": return `You walk ${label} about ${pct(m)}% ${more ? "slower" : "faster"} than the app assumed.`;
    case "settle_in": return `Getting started takes you about ${Math.round(DEFAULTS.settleMinutes * m)} minutes, not ${DEFAULTS.settleMinutes}.`;
    case "meals": return `Your meals really take about ${Math.round(DEFAULTS.mealMinutes * m)} minutes.`;
    case "exam_cram": return `About ${Math.round(DEFAULTS.cramShare * m * 100)}% of your revision for ${label} happens on the last night.`;
    case "follow_through": return `You finish about ${Math.round(m * 100)}% of the ${label} Orbit puts in front of you.`;
    case "proposal_fit": return `You accept about ${Math.round(m * 100)}% of suggestions about ${label}.`;
    default: return `${label}: ${m}x what the app assumed.`;
  }
}

/** Everything learned so far, as facts the UI and the voice agent can both use. */
export function learnedFacts(): LearnedFact[] {
  const out: LearnedFact[] = [];
  for (const [id, def] of Object.entries(ASPECTS)) {
    const st = learned().aspects[id];
    if (!st?.active) continue;
    const spec = specFor(id, []);
    const seen = new Set<string>();
    // The credit is whoever did the last review that changed anything: the
    // model when it answered, the rules when it did not. Said on screen, so
    // "learned by Nemotron" is never claimed for a week the model missed.
    const lastModel = [...st.lessons].reverse().find((l) => l.provider === "nemotron-hosted");
    const learnedBy = st.lessons.at(-1)?.provider === "nemotron-hosted" || (lastModel && st.lessons.at(-1)?.provider === "none") ? "nemotron-hosted" : (st.lessons.at(-1)?.provider ?? "heuristic");
    const memo = lastModel?.memo || st.memory.memos.at(-1)?.text || undefined;
    const push = (category: string, m: number) => {
      if (seen.has(category) || Math.abs(m - 1) < 0.05) return;
      seen.add(category);
      const categoryLabel = spec.categoryLabel[category] ?? def.spec.categoryLabel[category] ?? category;
      out.push({ aspect: id, label: def.label, effect: def.effect, category, categoryLabel, multiplier: m, sentence: sentenceFor(id, categoryLabel, m), learnedBy, memo });
    };
    for (const [category, m] of Object.entries(st.memory.multipliers)) push(category, m);
    const gm = st.memory.global;
    if (gm !== undefined && Math.abs(gm - 1) >= 0.05 && !seen.has("__overall")) {
      seen.add("__overall");
      const noun = def.spec.global?.noun ?? "overall";
      out.push({
        aspect: id, label: def.label, effect: def.effect, category: "__overall", categoryLabel: noun, multiplier: gm,
        sentence: `Across everything, your ${noun} runs about ${pct(gm)}% ${gm > 1 ? "over" : "under"} what the app assumed.`,
        learnedBy, memo,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1));
}

export { bucketOfSession, kindOf };
