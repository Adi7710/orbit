import type { HabitRecord } from "./habits";
import { taskKind, type TaskKind } from "./learning";
import { mulberry32 } from "./prng";
import { wall } from "./habitSeed";

/**
 * A made-up student, eight weeks of their life, with hidden true traits.
 *
 * Nothing here is real data. The traits are the answer key: the learner never
 * sees them, only the logs they produce, and the experiments check whether the
 * learning recovers what is actually true. Every row is flagged `synthetic`.
 */
export interface StudentTraits {
  /** actual minutes / the student's own estimate, by kind of work. */
  factor: Record<TaskKind, number>;
  /** +- fraction of random spread on any single session. */
  noise: number;
  /** actual walking minutes / planned walking minutes. */
  walkSpeed: number;
  /** Real minutes to settle in after a walk, against the app's 5. */
  settleMinutes: number;
  /** Real minutes for a meal, against the app's 35. */
  mealMinutes: number;
  /** How many hours before a deadline the student starts an assignment, on average. */
  assignmentLeadHours: number;
  /**
   * How that lead changes by kind of work. Below 1 means they leave it later,
   * which is what people do with the work they dread: the big assignments get
   * started closest to the wire even though they need the most time. That
   * collision is the thing worth catching.
   */
  leadFactor: Partial<Record<TaskKind, number>>;
  /** Share of exam studying that happens in the last 24 hours. */
  examCramShare: number;
}

export const TRAITS: StudentTraits = {
  factor: { big_assignment: 1.33, assignment: 1.05, lab: 1.2, reading: 0.85, exam_prep: 1.25, other: 1.0 },
  noise: 0.08,
  walkSpeed: 1.15,
  settleMinutes: 8,
  mealMinutes: 42,
  assignmentLeadHours: 9,
  leadFactor: { big_assignment: 0.45, assignment: 1.4, lab: 0.8 },
  examCramShare: 0.55,
};

/**
 * A second, different student, used only to check that what the learning does for
 * the first one is not tuned to her: takes far longer on big assignments, is
 * slower at reading, faster at labs, walks quickly, and starts closer to deadlines.
 */
export const TRAITS_B: StudentTraits = {
  factor: { big_assignment: 1.6, assignment: 1.2, lab: 0.95, reading: 1.1, exam_prep: 1.4, other: 1.1 },
  noise: 0.1,
  walkSpeed: 0.92,
  settleMinutes: 6,
  mealMinutes: 38,
  assignmentLeadHours: 4,
  leadFactor: { big_assignment: 0.55, assignment: 1.6, lab: 1.1 },
  examCramShare: 0.8,
};
export const studentB = (weeks = 8) => syntheticStudent(weeks, TRAITS_B, 777, "Jordan (synthetic, held out)");

export interface WalkRecord { week: number; from: string; to: string; leg: string; plannedMinutes: number; actualMinutes: number; synthetic: true }

/**
 * The walking legs the app already knows, with the minutes it allows for each.
 * `difficulty` is hidden truth: Benedum to the Cathedral is uphill and ends with
 * the Cathedral's slow lifts, so no single "this student walks 1.15x" factor can
 * fit all four legs. The learner has to find the legs, not just the student.
 */
export const LEGS = [
  { from: "Home", to: "Sennott", planned: 14, difficulty: 1, fromWeek: 1 },
  { from: "Sennott", to: "Benedum", planned: 7, difficulty: 1, fromWeek: 1 },
  { from: "Benedum", to: "Cathedral", planned: 9, difficulty: 1.25, fromWeek: 1 },
  { from: "Cathedral", to: "Home", planned: 16, difficulty: 0.95, fromWeek: 1 },
  // A leg the student only starts walking in week 5, when a class moves. It is
  // the transfer test: a learner that knows this person's pace should get it
  // right on the first walk, while anything learning leg by leg is still blind.
  { from: "Sennott", to: "Posvar", planned: 11, difficulty: 1, fromWeek: 5 },
] as const;
export const legId = (from: string, to: string) => `${from}->${to}`;
/**
 * One assessment and how the studying for it was really distributed. Orbit's
 * question is not how many minutes of revision there were, it is how many of
 * them landed in the last night, and whether that night had room for them.
 */
export interface ExamRecord {
  week: number;
  kind: "quiz" | "midterm";
  course: string;
  totalStudyMinutes: number;
  /** Of that total, the minutes done in the final 24 hours. */
  cramMinutes: number;
  cramShare: number;
  /** Usable gap the student actually had on the last evening. */
  lastNightGapMinutes: number;
  synthetic: true;
}

export interface OverheadRecord { week: number; kind: "settle" | "meal"; plannedMinutes: number; actualMinutes: number; synthetic: true }
export interface SyntheticStudent {
  name: string;
  traits: StudentTraits;
  weeks: number;
  sessions: HabitRecord[];
  walks: WalkRecord[];
  overheads: OverheadRecord[];
  exams: ExamRecord[];
}

/** Monday of week 1. */
const START = { y: 2026, m: 8, d: 31 };
const at = (h: number, m = 0) => h * 60 + m;

interface Slot { day: number; start: number; title: (w: number) => string; course: string; estimate: number; due?: boolean; onlyWeeks?: (w: number) => boolean }

const WEEK: Slot[] = [
  { day: 0, start: at(19), title: (w) => `Problem Set ${w}`, course: "MATH 0220", estimate: 90, due: true },
  { day: 1, start: at(11, 10), title: (w) => `Reading: Chapter ${w}`, course: "CS 0441", estimate: 40 },
  { day: 1, start: at(20), title: (w) => `Homework ${w}`, course: "CS 0441", estimate: 45, due: true },
  { day: 2, start: at(18), title: (w) => `Lab ${w} report`, course: "PHYS 0174", estimate: 120, due: true },
  { day: 3, start: at(21), title: (w) => `Discussion post ${w}`, course: "ENGCMP 0200", estimate: 30, due: true },
  { day: 4, start: at(11, 10), title: (w) => `Reading: Chapter ${w + 1}`, course: "CS 0441", estimate: 40 },
  { day: 5, start: at(15), title: (w) => `Essay draft ${w}`, course: "ENGCMP 0200", estimate: 150, due: true, onlyWeeks: (w) => w % 2 === 1 },
];
const EXAM_WEEKS = [4, 8];

export function syntheticStudent(weeks = 8, traits: StudentTraits = TRAITS, seed = 31337, name = "Maya (synthetic)"): SyntheticStudent {
  const rand = mulberry32(seed);
  const jitter = (spread: number) => 1 + (rand() * 2 - 1) * spread;
  // Walks and overheads draw from their own stream so that changing them cannot
  // shift the task sessions, and the assignment results stay reproducible.
  const randWalk = mulberry32(seed + 1);
  const jitterWalk = (spread: number) => 1 + (randWalk() * 2 - 1) * spread;
  const sessions: HabitRecord[] = [];
  const walks: WalkRecord[] = [];
  const overheads: OverheadRecord[] = [];
  const exams: ExamRecord[] = [];
  let n = 0;

  const add = (w: number, dayOffset: number, startMin: number, title: string, course: string, estimate: number, opts: { lead?: number } = {}) => {
    const kind = taskKind(title, estimate);
    const actual = Math.max(5, Math.round(estimate * traits.factor[kind] * jitter(traits.noise)));
    const day = new Date(Date.UTC(START.y, START.m - 1, START.d + (w - 1) * 7 + dayOffset));
    const startAt = wall(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), startMin);
    const completedAt = new Date(startAt.getTime() + actual * 60000);
    // No floor here on purpose. If they start later than the work needs, they
    // finish after the deadline, and that is exactly the failure to predict.
    const lead = opts.lead === undefined ? undefined : Math.max(0.25, opts.lead);
    sessions.push({
      taskId: `stu-${++n}`,
      title,
      domain: kind === "reading" || kind === "exam_prep" ? "learn" : "build",
      courseCode: course,
      plannedMinutes: estimate,
      actualMinutes: actual,
      completedAt,
      inGap: true,
      dueAt: lead === undefined ? undefined : new Date(startAt.getTime() + lead * 36e5),
      startedHoursBeforeDue: lead === undefined ? undefined : Math.round(lead * 10) / 10,
      week: w,
      synthetic: true,
    });
  };

  for (let w = 1; w <= weeks; w++) {
    for (const s of WEEK) {
      if (s.onlyWeeks && !s.onlyWeeks(w)) continue;
      const kind = taskKind(s.title(w), s.estimate);
      add(w, s.day, s.start, s.title(w), s.course, s.estimate, s.due ? { lead: traits.assignmentLeadHours * (traits.leadFactor[kind] ?? 1) * jitter(0.35) } : {});
    }
    // A quiz every week, a midterm twice a term. The quiz is the one that gets
    // crammed hardest: it is small enough to feel survivable the night before.
    for (const e of [{ kind: "quiz" as const, course: "CS 0441", total: 120, mult: 1.35 }, ...(EXAM_WEEKS.includes(w) ? [{ kind: "midterm" as const, course: "MATH 0220", total: 360, mult: 1 }] : [])]) {
      const share = Math.min(0.98, traits.examCramShare * e.mult * jitterWalk(0.12));
      const total = Math.round(e.total * jitterWalk(0.15));
      exams.push({
        week: w, kind: e.kind, course: e.course,
        totalStudyMinutes: total,
        cramMinutes: Math.round(total * share),
        cramShare: Math.round(share * 1000) / 1000,
        lastNightGapMinutes: Math.round(120 * jitterWalk(0.45)),
        synthetic: true,
      });
    }
    if (EXAM_WEEKS.includes(w)) {
      // Cramming: most of the studying lands in the last day before the exam.
      add(w, 4, at(16), "Midterm review (first pass)", "MATH 0220", 180, { lead: 52 });
      add(w, 6, at(22), "Midterm review (cram)", "MATH 0220", 180, { lead: 8 });
    }
    // Three walks a week on every leg the student is walking by then.
    const live = LEGS.filter((l) => w >= l.fromWeek);
    for (let i = 0; i < live.length * 3; i++) {
      const leg = live[i % live.length];
      const actual = leg.planned * traits.walkSpeed * leg.difficulty * jitterWalk(0.1);
      walks.push({ week: w, from: leg.from, to: leg.to, leg: legId(leg.from, leg.to), plannedMinutes: leg.planned, actualMinutes: Math.max(1, Math.round(actual * 10) / 10), synthetic: true });
    }
    for (let i = 0; i < 5; i++) overheads.push({ week: w, kind: "settle", plannedMinutes: 5, actualMinutes: Math.round(traits.settleMinutes * jitterWalk(0.15) * 10) / 10, synthetic: true });
    for (let i = 0; i < 3; i++) overheads.push({ week: w, kind: "meal", plannedMinutes: 35, actualMinutes: Math.round(traits.mealMinutes * jitterWalk(0.1)), synthetic: true });
  }

  sessions.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  return { name, traits, weeks, sessions, walks, overheads, exams };
}
