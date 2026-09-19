import { Estimator } from "@/core/estimator";
import { KIND_LABEL, emptyProfile, kindOf, planMinutes, scorePlans, taskKind, type LearnedProfile, type Score, type TaskKind } from "@/core/learning";
import { LEGS, legId, syntheticStudent, type SyntheticStudent } from "@/core/student";
import type { HabitRecord } from "@/core/habits";
import { reviewWeek, type WeeklyReview } from "./learner";
import { emptyMemory, learnFromWeek, type AspectSpec, type Observation, type WeekLesson, type WeekMemory } from "./weeklyLearner";

/**
 * Walk-forward test of one aspect at a time. The student's weeks are replayed in
 * order: week N is planned using only what the learner knew before week N, then
 * week N is scored, and only then revealed so it can change week N+1. Nothing is
 * ever scored on data the learner had already seen. Week 1 cannot benefit from
 * anything, so it is identical in every arm and results are reported for weeks 2+.
 *
 * The student is synthetic and its true traits are known, so the learned numbers
 * can be checked against the answer key the learner never sees.
 */
export type Arm = "raw" | "existing" | "existing-buffered" | "rules" | "nemotron" | "weekly-rules" | "weekly-nemotron";
const INCREMENTAL: Arm[] = ["weekly-rules", "weekly-nemotron"];
/** The cumulative arms are keyed by kind of work, so they only apply to assignments. */
const CUMULATIVE: Arm[] = ["rules", "nemotron"];
/** How much headroom the buffered baseline adds over the observed median. */
export const BUFFER = 1.15;

export type Aspect = "assignments" | "walking";

const ASSIGNMENT_KINDS: TaskKind[] = ["big_assignment", "assignment", "lab"];

export const ASPECTS: Record<Aspect, AspectSpec & { label: string; unit: string }> = {
  assignments: {
    id: "assignments",
    label: "Assignment time: how long assignments really take against the plan",
    unit: "min",
    categoryNoun: "kind of work",
    baselineNoun: "the student's own estimate",
    brief: "You decide how many minutes Orbit should plan for each kind of coursework next week. Plan too little and the student runs out of time; plan too much and the day is wasted.",
    categories: ASSIGNMENT_KINDS,
    categoryLabel: Object.fromEntries(ASSIGNMENT_KINDS.map((k) => [k, KIND_LABEL[k]])),
  },
  walking: {
    id: "walking",
    label: "Walking speed: how long this student's walks between buildings really take",
    unit: "min",
    categoryNoun: "walk between two buildings",
    baselineNoun: "the minutes the app currently allows for that walk",
    brief:
      "You decide how many minutes Orbit should allow for each walk between two campus buildings next week. This is not a guess about effort: allow too few minutes and the student is physically late to class, and every gap in their day is overstated.",
    categories: LEGS.map((l) => legId(l.from, l.to)),
    categoryLabel: Object.fromEntries(LEGS.map((l) => [legId(l.from, l.to), `${l.from} to ${l.to}`])),
  },
};

/** The answer key the learner never sees: what the multiplier for a category truly is. */
function trueMultiplier(aspect: Aspect, category: string, student: SyntheticStudent): number {
  if (aspect === "assignments") return student.traits.factor[category as TaskKind];
  const leg = LEGS.find((l) => legId(l.from, l.to) === category);
  return leg ? Math.round(student.traits.walkSpeed * leg.difficulty * 1000) / 1000 : 1;
}

/** This aspect's observations, week by week. Nothing outside the aspect is ever produced. */
function observationsByWeek(aspect: Aspect, student: SyntheticStudent): Map<number, Observation[]> {
  const out = new Map<number, Observation[]>();
  const push = (week: number, o: Observation) => out.set(week, [...(out.get(week) ?? []), o]);
  if (aspect === "assignments") {
    for (const r of student.sessions) {
      const kind = kindOf(r);
      if (ASSIGNMENT_KINDS.includes(kind)) push(r.week ?? 0, { label: r.title, category: kind, estimate: r.plannedMinutes, actual: r.actualMinutes });
    }
  } else {
    for (const w of student.walks) push(w.week, { label: `${w.from} to ${w.to}`, category: w.leg, estimate: w.plannedMinutes, actual: w.actualMinutes });
  }
  return out;
}

export interface ArmResult {
  arm: Arm;
  /** Pooled over weeks 2..N. */
  total: Score;
  perWeek: (Score & { week: number })[];
  /** Share of records where the plan was short at all, so the student would be late or over-run. */
  shortShare: number;
  learned?: { category: string; learned: number; truth: number; error: number }[];
  reviews?: WeeklyReview[];
  /** For the incremental arms: what the learner saw and changed, week by week. */
  lessons?: WeekLesson[];
  finalProfile?: LearnedProfile;
  story?: { title: string; estimate: number; plan: number; actual: number };
}

export interface ExperimentResult {
  aspect: Aspect;
  label: string;
  student: string;
  weeks: number;
  sessionsScored: number;
  arms: ArmResult[];
  ranAt: string;
}

/** The app as it is today: per-course calibration for work, the travel graph's median for walks. */
function existingPlanner(aspect: Aspect, student: SyntheticStudent, week: number): (o: Observation) => number {
  if (aspect === "assignments") {
    const est = new Estimator();
    const byTitle = new Map(student.sessions.map((r) => [r.title, r]));
    for (const r of student.sessions) if ((r.week ?? 0) < week) est.record(r.courseCode, r.domain, r.plannedMinutes, r.actualMinutes);
    return (o) => {
      const r = byTitle.get(o.label);
      return Math.round(o.estimate * est.multiplier(r?.courseCode, r?.domain ?? "build"));
    };
  }
  // TravelGraph switches from its default to the observed median after three trips.
  const seen = new Map<string, number[]>();
  for (const w of student.walks) if (w.week < week) seen.set(w.leg, [...(seen.get(w.leg) ?? []), w.actualMinutes]);
  return (o) => {
    const xs = seen.get(o.category) ?? [];
    if (xs.length < 3) return o.estimate;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
}

export async function runExperiment(aspect: Aspect, arms: Arm[], opts: { weeks?: number; student?: SyntheticStudent } = {}): Promise<ExperimentResult> {
  const student = opts.student ?? syntheticStudent(opts.weeks ?? 8);
  const spec = ASPECTS[aspect];
  const byWeek = observationsByWeek(aspect, student);
  const results: ArmResult[] = [];

  for (const arm of arms) {
    const incremental = INCREMENTAL.includes(arm);
    const cumulative = CUMULATIVE.includes(arm) && aspect === "assignments";
    let memory: WeekMemory = emptyMemory();
    let learned = emptyProfile();
    const lessons: WeekLesson[] = [];
    const reviews: WeeklyReview[] = [];
    const perWeek: ArmResult["perWeek"] = [];
    const pooled: { plan: number; actual: number }[] = [];
    let story: ArmResult["story"];

    for (let w = 1; w <= student.weeks; w++) {
      const week = byWeek.get(w) ?? [];
      const existing = arm === "existing" || arm === "existing-buffered" ? existingPlanner(aspect, student, w) : undefined;
      // Being a minute short on a walk means being late; a minute spare costs
      // almost nothing. The buffer buys that asymmetry in code.
      const buffer = arm === "existing-buffered" ? BUFFER : 1;
      const planOf = (o: Observation) =>
        arm === "raw" ? o.estimate
        : existing ? Math.round(existing(o) * buffer * 10) / 10
        : incremental ? Math.max(1, Math.round(o.estimate * (memory.multipliers[o.category] ?? 1) * 10) / 10)
        : cumulative ? planMinutes(o.estimate, taskKind(o.label, o.estimate), learned)
        : o.estimate;
      const pairs = week.map((o) => ({ plan: planOf(o), actual: o.actual }));
      perWeek.push({ week: w, ...scorePlans(pairs) });
      if (w >= 2) pooled.push(...pairs);
      if (w === 2 && !story && week.length) {
        const o = week.find((x) => x.category === (aspect === "assignments" ? "big_assignment" : legId(LEGS[2].from, LEGS[2].to))) ?? week[0];
        story = { title: o.label, estimate: o.estimate, plan: planOf(o), actual: o.actual };
      }
      // The week is scored with the plan the learner was working from, and only
      // then revealed to it, so nothing is ever scored on data it had seen.
      if (incremental) {
        const out = await learnFromWeek(week, memory, w, spec, { useModel: arm === "weekly-nemotron" });
        memory = out.memory;
        lessons.push(out.lesson);
      } else if (cumulative) {
        const out = await reviewWeek(student.sessions, learned, w, { useModel: arm === "nemotron" });
        learned = out.profile;
        reviews.push(out.review);
      }
    }

    const scored = pooled.length ? pooled : [];
    const res: ArmResult = {
      arm,
      total: scorePlans(scored),
      perWeek,
      shortShare: scored.length ? Math.round((scored.filter((p) => p.plan < p.actual).length / scored.length) * 100) / 100 : 0,
      story,
    };
    const truthTable = (get: (c: string) => number) =>
      spec.categories.map((c) => {
        const v = Math.round(get(c) * 1000) / 1000;
        const truth = trueMultiplier(aspect, c, student);
        return { category: c, learned: v, truth, error: Math.round(Math.abs(v - truth) * 1000) / 1000 };
      });
    if (incremental) {
      res.lessons = lessons;
      res.learned = truthTable((c) => memory.multipliers[c] ?? 1);
    } else if (cumulative) {
      res.reviews = reviews;
      res.finalProfile = learned;
      res.learned = truthTable((c) => learned.multipliers[c as TaskKind]?.value ?? 1);
    }
    results.push(res);
  }

  const sessionsScored = [...byWeek.entries()].filter(([w]) => w >= 2).reduce((n, [, os]) => n + os.length, 0);
  return { aspect, label: spec.label, student: student.name, weeks: student.weeks, sessionsScored, arms: results, ranAt: new Date().toISOString() };
}

const ARM_LABEL: Record<Arm, string> = {
  raw: "No learning (the app's current number)",
  existing: "App today (travel graph median / course calibration)",
  "existing-buffered": `App today plus a ${Math.round((1.15 - 1) * 100)}% safety buffer`,
  rules: "All history, code decides",
  nemotron: "All history, Nemotron votes",
  "weekly-rules": "One week at a time, running average",
  "weekly-nemotron": "One week at a time, Nemotron learns",
};
const pct = (a: number, b: number) => (a === 0 ? "n/a" : `${Math.round(((a - b) / a) * 100)}%`);

/** A short, human-readable report of an experiment. */
export function reportMarkdown(x: ExperimentResult): string {
  const raw = x.arms.find((y) => y.arm === "raw");
  const spec = ASPECTS[x.aspect];
  const lines: string[] = [`# ${x.label}`, "", `Student: ${x.student}. Weeks replayed: ${x.weeks}. Scored: weeks 2 to ${x.weeks} (${x.sessionsScored} records). Each week is planned with only what was known before it.`, ""];
  lines.push(`| Arm | Mean error (${spec.unit}) | Planned short by (total) | Records planned short |`, "|---|---|---|---|");
  for (const a of x.arms) lines.push(`| ${ARM_LABEL[a.arm]} | ${a.total.mae} | ${a.total.minutesShort} | ${Math.round(a.shortShare * 100)}% |`);
  if (raw) {
    lines.push("");
    for (const a of x.arms) if (a.arm !== "raw") lines.push(`- ${ARM_LABEL[a.arm]}: error ${pct(raw.total.mae, a.total.mae)} lower than no learning.`);
  }
  lines.push("", "Mean error by week:", "", `| Arm | ${x.arms[0].perWeek.map((w) => `W${w.week}`).join(" | ")} |`, `|---|${x.arms[0].perWeek.map(() => "---").join("|")}|`);
  for (const a of x.arms) lines.push(`| ${a.arm} | ${a.perWeek.map((w) => w.mae).join(" | ")} |`);
  for (const a of x.arms) {
    if (a.story) lines.push("", `${a.arm}: ${a.story.title} — the app allowed ${a.story.estimate}, this arm planned ${a.story.plan}, it took ${a.story.actual}.`);
    if (a.learned) {
      lines.push("", `${a.arm} against the student's hidden truth:`, "", "| | Learned | Truth | Error |", "|---|---|---|---|");
      for (const l of a.learned) lines.push(`| ${spec.categoryLabel[l.category] ?? l.category} | ${l.learned} | ${l.truth} | ${l.error} |`);
    }
  }
  return lines.join("\n");
}

/**
 * The week-by-week trace: what the learner was shown, what it changed, and
 * whether the next week's plans were actually better for it. This is the answer
 * to "does it learn from one week and change the next one".
 */
export function traceMarkdown(x: ExperimentResult, arm: Arm = "weekly-nemotron"): string {
  const a = x.arms.find((y) => y.arm === arm);
  const raw = x.arms.find((y) => y.arm === "raw");
  const spec = ASPECTS[x.aspect];
  if (!a?.lessons) return `no week-by-week trace for arm ${arm}`;
  const name = (c: string) => spec.categoryLabel[c] ?? c;
  const lines: string[] = [`# ${x.label} — week by week (${arm})`, "", `Student: ${x.student}. Each week is planned with what the learner knew *before* that week, then revealed to it.`, ""];
  lines.push("| Week | Records | Error with learning | Error without | Better? | What the learner changed |", "|---|---|---|---|---|---|");
  for (const l of a.lessons) {
    const mine = a.perWeek.find((w) => w.week === l.week)!;
    const none = raw?.perWeek.find((w) => w.week === l.week);
    const better = !none || l.week === 1 ? "—" : mine.mae < none.mae ? "yes" : mine.mae === none.mae ? "same" : "no";
    const changed = l.changes.length ? l.changes.map((c) => `${name(c.category)} ${c.from}→${c.to}`).join(", ") : "nothing";
    lines.push(`| ${l.week} | ${l.sessions.length} | ${mine.mae} | ${none?.mae ?? "—"} | ${better} | ${changed} |`);
  }
  for (const l of a.lessons) {
    lines.push("", `**Week ${l.week}** (${l.provider}${l.latencyMs ? `, ${l.latencyMs} ms` : ""})`, "");
    if (l.changes.length) lines.push(...l.changes.map((c) => `- ${name(c.category)}: ${c.from} to ${c.to}${c.clamped ? " (clamped)" : ""} — ${c.reason}`));
    else lines.push("- no change");
    if (l.memo) lines.push(`- memo to itself: "${l.memo}"`);
  }
  if (a.learned) {
    lines.push("", "Where it ended up against the student's hidden truth:", "", "| | Learned | Truth | Error |", "|---|---|---|---|");
    for (const t of a.learned) lines.push(`| ${name(t.category)} | ${t.learned} | ${t.truth} | ${t.error} |`);
  }
  return lines.join("\n");
}
