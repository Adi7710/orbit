import { Estimator } from "@/core/estimator";
import { KIND_LABEL, emptyProfile, kindOf, planMinutes, scorePlans, taskKind, type LearnedProfile, type Score, type TaskKind } from "@/core/learning";
import { LEGS, legId, syntheticStudent, type SyntheticStudent } from "@/core/student";
import type { HabitRecord } from "@/core/habits";
import { reviewWeek, type WeeklyReview } from "./learner";
import { emptyMemory, learnFromWeek, multiplierFor, type AspectSpec, type Observation, type WeekLesson, type WeekMemory } from "./weeklyLearner";

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

export type Aspect = "assignments" | "walking" | "procrastination" | "exams";

/** What the app assumes today: that revision is spread evenly over the three days before an assessment. */
export const DEFAULT_CRAM_SHARE = 1 / 3;

/** What the app assumes today: that work gets started the evening before it is due. */
export const DEFAULT_LEAD_HOURS = 12;

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
    global: { noun: "walking pace", warmupWeeks: 2, exceptionMinWeeks: 2, exceptionThreshold: 0.1 },
  },
  procrastination: {
    id: "procrastination",
    label: "Procrastination: how long before a deadline this student actually starts",
    unit: "h",
    categoryNoun: "kind of work",
    baselineNoun: `the ${DEFAULT_LEAD_HOURS} hours before a deadline that the app currently assumes work gets started`,
    brief:
      "You decide how many hours before a deadline Orbit should expect this student to actually begin each kind of work. This is not about how long the work takes, it is about when they start it. Predict it too early and Orbit schedules into gaps they will ignore; predict it too late and it never warns them in time to finish.",
    categories: ASSIGNMENT_KINDS,
    categoryLabel: Object.fromEntries(ASSIGNMENT_KINDS.map((k) => [k, KIND_LABEL[k]])),
    // A student who starts a big assignment two hours before it is due sits at
    // 0.15 of the app's assumption, far below the usual rail.
    clamp: { min: 0.05, max: 4 },
  },
  exams: {
    id: "exams",
    label: "Exam studying: how much of the revision really lands in the last night",
    unit: "share",
    categoryNoun: "kind of assessment",
    baselineNoun: "the even third of revision the app currently assumes falls in the last 24 hours",
    brief:
      "You decide what share of this student's revision Orbit should expect to land in the final 24 hours before each kind of assessment. This is not about how many minutes they revise, it is about when those minutes happen. If they really cram and Orbit spreads the plan over a week, the early sessions never happen and the last night is asked to hold more than it can.",
    categories: ["quiz", "midterm"],
    categoryLabel: { quiz: "quizzes", midterm: "midterms" },
    clamp: { min: 0.3, max: 3 },
  },
};

/** The answer key the learner never sees: what the multiplier for a category truly is. */
function trueMultiplier(aspect: Aspect, category: string, student: SyntheticStudent): number {
  if (aspect === "assignments") return student.traits.factor[category as TaskKind];
  if (aspect === "exams") {
    const mult = category === "quiz" ? 1.35 : 1;
    const share = Math.min(0.98, student.traits.examCramShare * mult);
    return Math.round((share / DEFAULT_CRAM_SHARE) * 1000) / 1000;
  }
  if (aspect === "procrastination") {
    const lead = student.traits.assignmentLeadHours * (student.traits.leadFactor[category as TaskKind] ?? 1);
    return Math.round((lead / DEFAULT_LEAD_HOURS) * 1000) / 1000;
  }
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
  } else if (aspect === "walking") {
    for (const w of student.walks) push(w.week, { label: `${w.from} to ${w.to}`, category: w.leg, estimate: w.plannedMinutes, actual: w.actualMinutes });
  } else if (aspect === "exams") {
    for (const e of student.exams) {
      push(e.week, {
        label: `${e.kind} in ${e.course}`, category: e.kind,
        estimate: DEFAULT_CRAM_SHARE, actual: e.cramShare,
        // Scoring needs the night itself; the model is only shown the share.
        meta: { total: e.totalStudyMinutes, cram: e.cramMinutes, gap: e.lastNightGapMinutes },
      });
    }
  } else {
    for (const r of student.sessions) {
      const kind = kindOf(r);
      if (!ASSIGNMENT_KINDS.includes(kind) || r.startedHoursBeforeDue === undefined) continue;
      push(r.week ?? 0, {
        label: r.title, category: kind,
        estimate: DEFAULT_LEAD_HOURS, actual: r.startedHoursBeforeDue,
        // Scoring needs the work itself; the model is only ever shown the lead.
        meta: { workEstimate: r.plannedMinutes, workActual: r.actualMinutes },
      });
    }
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
  /** The one pace learned for the person, where the aspect has one. */
  globalLearned?: number;
  /** Error on a category the learner had never seen before, in its first two weeks: the transfer test. */
  transfer?: Score & { category: string };
  /**
   * For procrastination the number is only a means: the point is whether Orbit
   * can see a deadline coming that this student will not make. A deadline is
   * really blown when they start later than the work needs; it is predicted
   * when the expected start leaves less time than the work is expected to take.
   */
  risk?: { deadlines: number; blown: number; caught: number; missed: number; falseAlarms: number };
  /**
   * The same question asked with the student's own estimate of the work instead
   * of what aspect 1 learned it really takes. The gap between the two is the
   * point: knowing when someone starts is useless unless you also know how long
   * the work will actually hold them.
   */
  riskNaive?: { deadlines: number; blown: number; caught: number; missed: number; falseAlarms: number };
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
    const transferPairs: { category: string; week: number; plan: number; actual: number }[] = [];
    const risk = { deadlines: 0, blown: 0, caught: 0, missed: 0, falseAlarms: 0 };
    const riskNaive = { deadlines: 0, blown: 0, caught: 0, missed: 0, falseAlarms: 0 };
    /** What aspect 1 would have learned about work length from the weeks before this one. */
    const workFactor = (w: number, category: string) => {
      const past = student.sessions.filter((r) => (r.week ?? 0) < w && kindOf(r) === category);
      if (past.length < 2) return 1;
      return past.reduce((a, r) => a + r.actualMinutes / r.plannedMinutes, 0) / past.length;
    };

    for (let w = 1; w <= student.weeks; w++) {
      const week = byWeek.get(w) ?? [];
      const existing = arm === "existing" || arm === "existing-buffered" ? existingPlanner(aspect, student, w) : undefined;
      // Being a minute short on a walk means being late; a minute spare costs
      // almost nothing. The buffer buys that asymmetry in code.
      const buffer = arm === "existing-buffered" ? BUFFER : 1;
      const planOf = (o: Observation) =>
        arm === "raw" ? o.estimate
        : existing ? Math.round(existing(o) * buffer * 10) / 10
        : incremental ? Math.max(1, Math.round(o.estimate * multiplierFor(memory, o.category) * 10) / 10)
        : cumulative ? planMinutes(o.estimate, taskKind(o.label, o.estimate), learned)
        : o.estimate;
      const pairs = week.map((o) => ({ plan: planOf(o), actual: o.actual }));
      for (const o of week) transferPairs.push({ category: o.category, week: w, plan: planOf(o), actual: o.actual });
      if (aspect === "exams" && w >= 2) {
        for (const o of week) {
          const m = o.meta;
          if (!m) continue;
          risk.deadlines++;
          // The night really was too small when the crammed minutes did not fit.
          const reallyShort = m.cram > m.gap;
          const predicted = m.total * planOf(o) > m.gap;
          if (reallyShort) { risk.blown++; if (predicted) risk.caught++; else risk.missed++; }
          else if (predicted) risk.falseAlarms++;
        }
      }
      if (aspect === "procrastination" && w >= 2) {
        for (const o of week) {
          const m = o.meta;
          if (!m) continue;
          const reallyBlown = o.actual * 60 < m.workActual;
          const leadMinutes = planOf(o) * 60;
          const tally = (t: typeof risk, needs: number) => {
            t.deadlines++;
            const predicted = leadMinutes < needs;
            if (reallyBlown) { t.blown++; if (predicted) t.caught++; else t.missed++; }
            else if (predicted) t.falseAlarms++;
          };
          tally(risk, m.workEstimate * workFactor(w, o.category));
          tally(riskNaive, m.workEstimate);
        }
      }
      perWeek.push({ week: w, ...scorePlans(pairs) });
      if (w >= 2) pooled.push(...pairs);
      if (w === 2 && !story && week.length) {
        const o = week.find((x) => x.category === (aspect === "walking" ? legId(LEGS[2].from, LEGS[2].to) : "big_assignment")) ?? week[0];
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
    // The transfer test: a category that first appears partway through. How well
    // is it planned in its first two weeks, before it has any history of its own?
    const firstSeen = new Map<string, number>();
    for (const [w, os] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) for (const o of os) if (!firstSeen.has(o.category)) firstSeen.set(o.category, w);
    const late = [...firstSeen.entries()].find(([, w]) => w > 1);
    const res: ArmResult = {
      arm,
      total: scorePlans(scored),
      perWeek,
      shortShare: scored.length ? Math.round((scored.filter((p) => p.plan < p.actual).length / scored.length) * 100) / 100 : 0,
      story,
    };
    if (aspect === "procrastination") { res.risk = risk; res.riskNaive = riskNaive; }
    if (aspect === "exams") res.risk = risk;
    if (late) {
      const [cat, from] = late;
      const pairs = transferPairs.filter((p) => p.category === cat && p.week < from + 2);
      if (pairs.length) res.transfer = { category: cat, ...scorePlans(pairs) };
    }
    const truthTable = (get: (c: string) => number) =>
      spec.categories.map((c) => {
        const v = Math.round(get(c) * 1000) / 1000;
        const truth = trueMultiplier(aspect, c, student);
        return { category: c, learned: v, truth, error: Math.round(Math.abs(v - truth) * 1000) / 1000 };
      });
    if (incremental) {
      res.lessons = lessons;
      res.learned = truthTable((c) => multiplierFor(memory, c));
      res.globalLearned = memory.global;
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
