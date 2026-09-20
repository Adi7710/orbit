import type { HabitRecord } from "./habits";
import { kindOf, taskKind, KIND_LABEL, type TaskKind } from "./learning";
import type { Domain } from "./types";

/**
 * Every pattern Orbit learns about one student, declared in one place.
 *
 * An aspect is a question of the same shape, whatever it is about: *the app
 * assumes X, what does this person actually do?* The answer is always a
 * multiplier on the app's assumption, which is what lets one learner serve all
 * of them and what makes adding a new one a registry entry rather than new code.
 *
 * Adding an aspect means writing three things and nothing else:
 *   - what the app currently assumes (`baselineNoun`, and the estimate on each
 *     observation),
 *   - how to pull this week's evidence out of what the app already records
 *     (`collect`),
 *   - what changes once it is known (`effect`, and one line in `src/lib/learned.ts`).
 *
 * Nothing here touches the network or a framework, so all of it is testable.
 */

/** One thing that happened: what the app assumed, and what really happened. */
export interface Observation {
  label: string;
  /** What the multiplier is learned per: a kind of work, a walking leg, a time of day. */
  category: string;
  /** What the app would assume before any learning. */
  estimate: number;
  actual: number;
  /** Anything scoring needs that the model is never shown. */
  meta?: Record<string, number>;
}

export interface WeeklyObservation extends Observation {
  week: number;
}

export interface AspectSpec {
  id: string;
  /** "kind of work", "walk between two buildings", "time of day". */
  categoryNoun: string;
  /** What the multiplier scales. */
  baselineNoun: string;
  /** Two sentences telling the model what it is deciding and why it matters. */
  brief: string;
  categories: string[];
  categoryLabel: Record<string, string>;
  /** Overrides the default safety rail, for aspects whose true values sit far from 1. */
  clamp?: { min: number; max: number };
  /**
   * Some aspects are one trait plus exceptions rather than a number per
   * category. Walking is: a person has a pace, and it applies to every walk
   * including ones they have never taken. A category only earns its own number
   * when it keeps disagreeing with that pace.
   */
  global?: {
    noun: string;
    /** Nothing changes at all until this many weeks have been seen. */
    warmupWeeks: number;
    /** A category must disagree in this many separate weeks before it may have its own number. */
    exceptionMinWeeks: number;
    exceptionThreshold: number;
  };
}

/** Everything the app has recorded that any aspect might learn from. */
export interface LearningInput {
  habits: HabitRecord[];
  walks?: { week: number; leg: string; label?: string; plannedMinutes: number; actualMinutes: number }[];
  overheads?: { week: number; kind: string; plannedMinutes: number; actualMinutes: number }[];
  exams?: { week: number; kind: string; totalStudyMinutes: number; cramMinutes: number; cramShare: number; lastNightGapMinutes: number }[];
  /** Resolved proposals, so the app can stop suggesting what this person always declines. */
  proposals?: { week: number; kind: string; approved: boolean }[];
  /** What Orbit put in a gap against whether it actually got done. */
  scheduled?: { week: number; domain: Domain; offered: number; done: number }[];
  /**
   * The minutes the app would already plan for a session before the aspect
   * being learned gets its say. Aspects that sit on top of another one must
   * learn the residual, not the whole error, or the same correction is counted
   * twice: "big assignments run 1.37x" and "this course runs 1.33x" would
   * multiply to 1.82x for a task that is both.
   */
  baseline?: (r: HabitRecord, forAspect: string) => number;
}

export interface AspectDef {
  spec: AspectSpec;
  /** Aspects whose correction is already inside this one's baseline. */
  onTopOf?: string[];
  label: string;
  /** One line, in plain words, of what changes in the app once this is known. */
  effect: string;
  /** How many observations before anything is believed. */
  minObservations: number;
  /** This week's evidence, pulled from what the app already records. */
  collect: (input: LearningInput) => WeeklyObservation[];
}

// MARK: - Shared helpers

const ASSIGNMENT_KINDS: TaskKind[] = ["big_assignment", "assignment", "lab"];
const kindLabels = (ks: TaskKind[]) => Object.fromEntries(ks.map((k) => [k, KIND_LABEL[k]]));

/** What the app assumes today, before it knows anything about a person. */
export const DEFAULTS = {
  leadHours: 12,
  cramShare: 1 / 3,
  settleMinutes: 5,
  mealMinutes: 35,
  /** A rate aspect's baseline: the app assumes what it offers gets done. */
  rate: 1,
};

export type TimeBucket = "morning" | "midday" | "evening" | "late";
const BUCKETS: TimeBucket[] = ["morning", "midday", "evening", "late"];
const BUCKET_LABEL: Record<TimeBucket, string> = {
  morning: "before noon",
  midday: "between noon and five",
  evening: "between five and ten",
  late: "after ten at night",
};

/** The bucket a session started in, in the student's own zone. */
export function bucketOfSession(r: HabitRecord, tz = "America/New_York"): TimeBucket {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(r.completedAt);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const start = ((((get("hour") % 24) * 60 + get("minute")) - r.actualMinutes) % 1440 + 1440) % 1440;
  if (start < 12 * 60) return "morning";
  if (start < 17 * 60) return "midday";
  if (start < 22 * 60) return "evening";
  return "late";
}

export type GapBand = "short" | "medium" | "long";
const GAP_LABEL: Record<GapBand, string> = { short: "gaps under 45 minutes", medium: "gaps of 45 to 90 minutes", long: "gaps over 90 minutes" };
export const gapBand = (minutes: number): GapBand => (minutes < 45 ? "short" : minutes <= 90 ? "medium" : "long");

const DOMAINS: Domain[] = ["learn", "build", "body", "life"];
const DOMAIN_LABEL: Record<Domain, string> = { learn: "reading and studying", build: "graded work", body: "exercise", life: "errands and life admin" };

const usable = (r: HabitRecord) => r.plannedMinutes > 0 && r.actualMinutes > 0;
/** What this session was already going to be planned at, before this aspect. */
const priorPlan = (i: LearningInput, r: HabitRecord, forAspect: string) => i.baseline?.(r, forAspect) ?? r.plannedMinutes;

const ratioObs = (label: string, category: string, week: number, estimate: number, actual: number, meta?: Record<string, number>): WeeklyObservation => ({ label, category, week, estimate, actual, meta });

// MARK: - The registry

export const ASPECTS: Record<string, AspectDef> = {
  /** How long work really takes. The one every plan depends on. */
  work_length: {
    label: "How long each kind of work really takes",
    effect: "Changes the minutes Orbit plans for a task, and therefore which gap it fits in.",
    minObservations: 2,
    spec: {
      id: "work_length",
      categoryNoun: "kind of work",
      baselineNoun: "the student's own estimate",
      brief: "You decide how many minutes Orbit should plan for each kind of coursework. Plan too little and they run out of time; plan too much and the day is wasted.",
      categories: ASSIGNMENT_KINDS,
      categoryLabel: kindLabels(ASSIGNMENT_KINDS),
    },
    collect: (i) =>
      i.habits.filter(usable).flatMap((r) => {
        const k = kindOf(r);
        return ASSIGNMENT_KINDS.includes(k) ? [ratioObs(r.title, k, r.week ?? 0, r.plannedMinutes, r.actualMinutes)] : [];
      }),
  },

  /** The same question per course, because one class is always the heavy one. */
  course_load: {
    onTopOf: ["work_length"],
    label: "Which courses take more time than they look like they should",
    effect: "Adds a per-course correction on top of the kind-of-work one.",
    minObservations: 3,
    spec: {
      id: "course_load",
      categoryNoun: "course",
      baselineNoun: "the minutes already planned for that work",
      brief: "You decide whether a particular course reliably takes this student more or less time than its work would suggest. Only say so when one course really stands apart from the others.",
      categories: [],
      categoryLabel: {},
      global: { noun: "overall course load", warmupWeeks: 2, exceptionMinWeeks: 2, exceptionThreshold: 0.12 },
    },
    collect: (i) => i.habits.filter((r) => usable(r) && r.courseCode).map((r) => ratioObs(r.title, r.courseCode!, r.week ?? 0, priorPlan(i, r, "course_load"), r.actualMinutes)),
  },

  /** When they actually begin, which decides whether a deadline survives. */
  procrastination: {
    label: "How long before a deadline they actually start",
    effect: "Lets Orbit warn, days ahead, that a deadline will not survive how late they start.",
    minObservations: 2,
    spec: {
      id: "procrastination",
      categoryNoun: "kind of work",
      baselineNoun: `the ${DEFAULTS.leadHours} hours before a deadline the app assumes work gets started`,
      brief: "You decide how many hours before a deadline Orbit should expect this student to begin each kind of work. This is about when they start, not how long it takes. Predict too early and Orbit schedules into gaps they ignore; too late and it never warns them in time.",
      categories: ASSIGNMENT_KINDS,
      categoryLabel: kindLabels(ASSIGNMENT_KINDS),
      clamp: { min: 0.05, max: 4 },
    },
    collect: (i) =>
      i.habits.flatMap((r) => {
        const k = kindOf(r);
        if (!ASSIGNMENT_KINDS.includes(k) || r.startedHoursBeforeDue === undefined) return [];
        return [ratioObs(r.title, k, r.week ?? 0, DEFAULTS.leadHours, r.startedHoursBeforeDue, { workEstimate: r.plannedMinutes, workActual: r.actualMinutes })];
      }),
  },

  /** When in the day they are actually fast. */
  time_of_day: {
    onTopOf: ["work_length", "course_load"],
    label: "What time of day they actually work fastest",
    effect: "Orders which gap gets the hardest task, instead of always taking the earliest.",
    minObservations: 3,
    spec: {
      id: "time_of_day",
      categoryNoun: "time of day",
      baselineNoun: "the minutes already planned for that work",
      brief: "You decide whether this student is faster or slower at different times of day. A morning full of easy tasks is not the same as being fast in the morning, so judge it against what the work itself should have taken.",
      categories: BUCKETS,
      categoryLabel: BUCKET_LABEL,
      global: { noun: "overall pace", warmupWeeks: 2, exceptionMinWeeks: 2, exceptionThreshold: 0.1 },
    },
    collect: (i) => i.habits.filter(usable).map((r) => ratioObs(r.title, bucketOfSession(r), r.week ?? 0, priorPlan(i, r, "time_of_day"), r.actualMinutes)),
  },

  /** Whether a short gap is usable for this person at all. */
  gap_fit: {
    onTopOf: ["work_length", "course_load"],
    label: "Whether short gaps actually work for them",
    effect: "Stops Orbit putting real work in a gap this person never gets going in.",
    minObservations: 3,
    spec: {
      id: "gap_fit",
      categoryNoun: "length of gap",
      baselineNoun: "the minutes already planned for that work",
      brief: "You decide whether the length of a gap changes how much this student gets done in it. Some people need twenty minutes to start, so a short gap costs them far more than its size suggests.",
      categories: ["short", "medium", "long"],
      categoryLabel: GAP_LABEL,
    },
    collect: (i) =>
      i.habits.flatMap((r) => (usable(r) && r.inGap && r.meta?.gapMinutes ? [ratioObs(r.title, gapBand(r.meta.gapMinutes), r.week ?? 0, priorPlan(i, r, "gap_fit"), r.actualMinutes)] : [])),
  },

  /** Their walking pace, which transfers to routes they have never walked. */
  walking: {
    label: "How fast they actually walk",
    effect: "Corrects every walk in the ledger, including routes they have never taken, and the leave-by time for the bus.",
    minObservations: 3,
    spec: {
      id: "walking",
      categoryNoun: "walk between two places",
      baselineNoun: "the minutes the app currently allows for that walk",
      brief: "You decide how many minutes Orbit should allow for each walk. Allow too few and the student is physically late; allow too many and every gap in their day is overstated. If they consistently beat the allowance, say so plainly: the point is to show them the shorter, true number.",
      categories: [],
      categoryLabel: {},
      global: { noun: "walking pace", warmupWeeks: 2, exceptionMinWeeks: 2, exceptionThreshold: 0.1 },
    },
    collect: (i) => (i.walks ?? []).map((w) => ratioObs(w.label ?? w.leg, w.leg, w.week, w.plannedMinutes, w.actualMinutes)),
  },

  /** The minutes nobody counts. */
  settle_in: {
    label: "How long they take to actually get started after arriving",
    effect: "Corrects the honest ledger, which currently assumes five minutes for everyone.",
    minObservations: 3,
    spec: {
      id: "settle_in",
      categoryNoun: "settling-in period",
      baselineNoun: `the ${DEFAULTS.settleMinutes} minutes the app assumes it takes to get started`,
      brief: "You decide how long this student really takes to settle before work begins after arriving somewhere. These are the minutes nobody counts and the reason a day has less in it than the calendar claims.",
      categories: ["settle"],
      categoryLabel: { settle: "settling in" },
      clamp: { min: 0.5, max: 5 },
    },
    collect: (i) => (i.overheads ?? []).filter((o) => o.kind === "settle").map((o, n) => ratioObs(`settle ${n + 1}`, "settle", o.week, o.plannedMinutes, o.actualMinutes)),
  },

  meals: {
    label: "How long their meals really take",
    effect: "Corrects the honest ledger's meal allowance.",
    minObservations: 3,
    spec: {
      id: "meals",
      categoryNoun: "meal",
      baselineNoun: `the ${DEFAULTS.mealMinutes} minutes the app allows for a meal`,
      brief: "You decide how long this student's meals really take, including getting there and back. Eating is one of the largest things the calendar never shows.",
      categories: ["meal"],
      categoryLabel: { meal: "meals" },
      clamp: { min: 0.4, max: 4 },
    },
    collect: (i) => (i.overheads ?? []).filter((o) => o.kind === "meal").map((o, n) => ratioObs(`meal ${n + 1}`, "meal", o.week, o.plannedMinutes, o.actualMinutes)),
  },

  /** How revision is distributed, which decides whether the last night can hold it. */
  exam_cram: {
    label: "How much revision lands in the last night",
    effect: "Warns a week ahead when the night before an assessment cannot hold what they are about to cram into it.",
    minObservations: 2,
    spec: {
      id: "exam_cram",
      categoryNoun: "kind of assessment",
      baselineNoun: "the even third of revision the app assumes falls in the last 24 hours",
      brief: "You decide what share of this student's revision lands in the final 24 hours before each kind of assessment. This is about when the minutes happen, not how many there are. If they really cram and Orbit spreads the plan over a week, the early sessions never happen and the last night is asked to hold more than it can.",
      categories: ["quiz", "midterm"],
      categoryLabel: { quiz: "quizzes", midterm: "midterms" },
      clamp: { min: 0.3, max: 3 },
    },
    collect: (i) =>
      (i.exams ?? []).map((e) =>
        ratioObs(`${e.kind}`, e.kind, e.week, DEFAULTS.cramShare, e.cramShare, { total: e.totalStudyMinutes, cram: e.cramMinutes, gap: e.lastNightGapMinutes }),
      ),
  },

  /** What they quietly never do, whatever the plan says. */
  follow_through: {
    label: "Which kinds of task they actually finish when offered",
    effect: "Stops Orbit filling gaps with the kind of task this person silently skips every week.",
    minObservations: 2,
    spec: {
      id: "follow_through",
      categoryNoun: "area of life",
      baselineNoun: "the app's assumption that what it offers gets done",
      brief: "You decide how much of what Orbit puts in front of this student actually gets finished, area by area. A number well below 1 means Orbit keeps planning something they never do, and it should stop taking up their gaps with it.",
      categories: DOMAINS,
      categoryLabel: DOMAIN_LABEL,
      clamp: { min: 0.05, max: 1.2 },
    },
    collect: (i) => (i.scheduled ?? []).filter((s) => s.offered > 0).map((s) => ratioObs(`${s.domain} offered`, s.domain, s.week, DEFAULTS.rate, s.done / s.offered)),
  },

  /** Which suggestions are worth making at all. */
  proposal_fit: {
    label: "Which of the agent's suggestions they actually accept",
    effect: "Stops the day agent proposing the kind of thing this person always declines.",
    minObservations: 2,
    spec: {
      id: "proposal_fit",
      categoryNoun: "kind of suggestion",
      baselineNoun: "the app's assumption that a suggestion is worth making",
      brief: "You decide how welcome each kind of suggestion is to this student, based on which ones they approve and which they wave away. A number near zero means the suggestion is noise to this person and should not be offered.",
      categories: ["move_task", "book_room", "draft_extension", "notify_friends"],
      categoryLabel: {
        move_task: "moving a task into a gap",
        book_room: "booking a room",
        draft_extension: "drafting an extension email",
        notify_friends: "telling friends they are free",
      },
      clamp: { min: 0.05, max: 1.2 },
    },
    collect: (i) => {
      const byWeekKind = new Map<string, { n: number; yes: number; week: number; kind: string }>();
      for (const p of i.proposals ?? []) {
        const key = `${p.week}|${p.kind}`;
        const e = byWeekKind.get(key) ?? { n: 0, yes: 0, week: p.week, kind: p.kind };
        e.n++;
        if (p.approved) e.yes++;
        byWeekKind.set(key, e);
      }
      return [...byWeekKind.values()].map((e) => ratioObs(`${e.kind} suggestions`, e.kind, e.week, DEFAULTS.rate, e.yes / e.n));
    },
  },
};

export type AspectId = keyof typeof ASPECTS | string;
export const aspectIds = () => Object.keys(ASPECTS);

/**
 * Categories are not always known up front: courses and walking legs depend on
 * the student. An aspect declaring none learns whichever ones show up.
 */
export function specFor(id: AspectId, observed: WeeklyObservation[]): AspectSpec {
  const def = ASPECTS[id];
  if (!def) throw new Error(`unknown aspect ${id}`);
  if (def.spec.categories.length > 0) return def.spec;
  const categories = [...new Set(observed.map((o) => o.category))].sort();
  return {
    ...def.spec,
    categories,
    categoryLabel: { ...Object.fromEntries(categories.map((c) => [c, c])), ...def.spec.categoryLabel },
  };
}

/** The kind of work a title describes, re-exported so callers need one import. */
export { taskKind };
