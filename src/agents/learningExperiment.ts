import { Estimator } from "@/core/estimator";
import { KIND_LABEL, TASK_KINDS, emptyProfile, kindOf, planMinutes, scorePlans, type LearnedProfile, type Score, type TaskKind } from "@/core/learning";
import { syntheticStudent, type SyntheticStudent } from "@/core/student";
import type { HabitRecord } from "@/core/habits";
import { reviewWeek, type WeeklyReview } from "./learner";
import { emptyMemory, learnFromWeek, type WeekLesson, type WeekMemory } from "./weeklyLearner";

/**
 * Walk-forward test of one optimization. The student's weeks are replayed in
 * order; the plan for week N is made using only weeks before N, then week N is
 * revealed, scored, and reviewed so it can change week N+1. Four arms compete:
 *
 *  - raw:      plan = the student's own estimate (an app that never learns)
 *  - existing: the app's Estimator today (per course and domain, needs 5 samples)
 *  - rules:    the weekly learner with code deciding (adopt everything eligible)
 *  - nemotron: the weekly learner with Nemotron deciding, code verifying
 *
 * Week 1 cannot benefit from anything, so results are reported for weeks 2+.
 * The student is synthetic and its true traits are known, so we can also check
 * whether the learned multipliers recover them.
 */
export type Arm = "raw" | "existing" | "rules" | "nemotron" | "weekly-rules" | "weekly-nemotron";
/** The arms that learn from one week at a time, where the learner itself carries the state. */
const INCREMENTAL: Arm[] = ["weekly-rules", "weekly-nemotron"];
export type Aspect = "assignments";

export const ASPECTS: Record<Aspect, { label: string; kinds: TaskKind[]; note: string }> = {
  assignments: { label: "Assignment time: how long assignments really take against the plan", kinds: ["big_assignment", "assignment", "lab"], note: "Sessions of kind big assignment, assignment and lab report." },
};

export interface ArmResult {
  arm: Arm;
  /** Pooled over weeks 2..N. */
  total: Score;
  perWeek: (Score & { week: number })[];
  /** Learned multipliers after the last review against the student's hidden true factor. */
  learned?: { kind: TaskKind; learned: number; truth: number; error: number }[];
  reviews?: WeeklyReview[];
  /** For the incremental arms: what the learner saw and changed, week by week. */
  lessons?: WeekLesson[];
  finalProfile?: LearnedProfile;
  /** What this arm planned for the first big assignment of week 2. */
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

const inAspect = (r: HabitRecord, kinds: TaskKind[]) => kinds.includes(kindOf(r));

function existingPlan(history: HabitRecord[], week: number) {
  const est = new Estimator();
  for (const r of history) if ((r.week ?? 0) < week) est.record(r.courseCode, r.domain, r.plannedMinutes, r.actualMinutes);
  return (r: HabitRecord) => Math.round(r.plannedMinutes * est.multiplier(r.courseCode, r.domain));
}

export async function runExperiment(aspect: Aspect, arms: Arm[], opts: { weeks?: number; student?: SyntheticStudent } = {}): Promise<ExperimentResult> {
  const student = opts.student ?? syntheticStudent(opts.weeks ?? 8);
  const kinds = ASPECTS[aspect].kinds;
  const results: ArmResult[] = [];

  for (const arm of arms) {
    let learned = emptyProfile();
    const reviews: WeeklyReview[] = [];
    const perWeek: ArmResult["perWeek"] = [];
    const pooled: { plan: number; actual: number }[] = [];
    let story: ArmResult["story"];

    const incremental = INCREMENTAL.includes(arm);
    let memory: WeekMemory = emptyMemory();
    const lessons: WeekLesson[] = [];

    for (let w = 1; w <= student.weeks; w++) {
      const weekRows = student.sessions.filter((r) => r.week === w && inAspect(r, kinds));
      const before = student.sessions.filter((r) => (r.week ?? 0) < w);
      const planExisting = arm === "existing" ? existingPlan(before, w) : undefined;
      const planOf = (r: HabitRecord) =>
        arm === "raw" ? r.plannedMinutes
        : arm === "existing" ? planExisting!(r)
        : incremental ? Math.max(1, Math.round(r.plannedMinutes * (memory.multipliers[kindOf(r)] ?? 1)))
        : planMinutes(r.plannedMinutes, kindOf(r), learned);
      const pairs = weekRows.map((r) => ({ plan: planOf(r), actual: r.actualMinutes }));
      perWeek.push({ week: w, ...scorePlans(pairs) });
      if (w >= 2) pooled.push(...pairs);
      if (w === 2 && !story) {
        const r = weekRows.find((x) => kindOf(x) === "big_assignment");
        if (r) story = { title: r.title, estimate: r.plannedMinutes, plan: planOf(r), actual: r.actualMinutes };
      }
      // The week is scored with the plan the learner was working from, and only
      // then revealed to it, so nothing is ever scored on data it had seen.
      if (incremental) {
        const out = await learnFromWeek(weekRows, memory, w, kinds, { useModel: arm === "weekly-nemotron" });
        memory = out.memory;
        lessons.push(out.lesson);
      } else if (arm === "rules" || arm === "nemotron") {
        const { profile, review } = await reviewWeek(student.sessions, learned, w, { useModel: arm === "nemotron" });
        learned = profile;
        reviews.push(review);
      }
    }

    const res: ArmResult = { arm, total: scorePlans(pooled), perWeek, story };
    const truthTable = (get: (k: TaskKind) => number) =>
      kinds.map((k) => {
        const v = get(k);
        return { kind: k, learned: v, truth: student.traits.factor[k], error: Math.round(Math.abs(v - student.traits.factor[k]) * 1000) / 1000 };
      });
    if (incremental) {
      res.lessons = lessons;
      res.learned = truthTable((k) => memory.multipliers[k] ?? 1);
    } else if (arm === "rules" || arm === "nemotron") {
      res.reviews = reviews;
      res.finalProfile = learned;
      res.learned = truthTable((k) => learned.multipliers[k]?.value ?? 1);
    }
    results.push(res);
  }

  const sessionsScored = student.sessions.filter((r) => (r.week ?? 0) >= 2 && inAspect(r, kinds)).length;
  return { aspect, label: ASPECTS[aspect].label, student: student.name, weeks: student.weeks, sessionsScored, arms: results, ranAt: new Date().toISOString() };
}

const pct = (a: number, b: number) => (a === 0 ? "n/a" : `${Math.round(((a - b) / a) * 100)}%`);

/** A short, human-readable report of an experiment, for docs and for the person approving it. */
export function reportMarkdown(x: ExperimentResult): string {
  const byArm = new Map(x.arms.map((a) => [a.arm, a]));
  const raw = byArm.get("raw");
  const lines: string[] = [`# ${x.label}`, "", `Student: ${x.student}. Weeks replayed: ${x.weeks}. Scored: weeks 2 to ${x.weeks} (${x.sessionsScored} sessions). The plan for each week uses only earlier weeks.`, ""];
  lines.push("| Arm | Mean error (min) | Plan too short by (min, total) | Sessions under-planned | Bias (min) |", "|---|---|---|---|---|");
  const label: Record<Arm, string> = { raw: "No learning (student's own estimate)", existing: "App today (per-course calibration)", rules: "All history, code decides", nemotron: "All history, Nemotron votes", "weekly-rules": "One week at a time, running average", "weekly-nemotron": "One week at a time, Nemotron learns" };
  for (const a of x.arms) lines.push(`| ${label[a.arm]} | ${a.total.mae} | ${a.total.minutesShort} | ${Math.round(a.total.underPlanned * 100)}% | ${a.total.bias} |`);
  if (raw) {
    lines.push("");
    for (const a of x.arms) if (a.arm !== "raw") lines.push(`- ${label[a.arm]}: error ${pct(raw.total.mae, a.total.mae)} lower and ${pct(raw.total.minutesShort, a.total.minutesShort)} fewer minutes short than no learning.`);
  }
  lines.push("", "Mean error by week:", "", `| Arm | ${x.arms[0].perWeek.map((w) => `W${w.week}`).join(" | ")} |`, `|---|${x.arms[0].perWeek.map(() => "---").join("|")}|`);
  for (const a of x.arms) lines.push(`| ${a.arm} | ${a.perWeek.map((w) => w.mae).join(" | ")} |`);
  for (const a of x.arms) {
    if (a.story) lines.push("", `${a.arm}: ${a.story.title} was estimated at ${a.story.estimate} minutes, planned at ${a.story.plan}, and took ${a.story.actual}.`);
    if (a.learned) {
      lines.push("", `${a.arm} learned multipliers vs the student's hidden truth:`, "", "| Kind | Learned | Truth | Error |", "|---|---|---|---|");
      for (const l of a.learned) lines.push(`| ${KIND_LABEL[l.kind]} | ${l.learned} | ${l.truth} | ${l.error} |`);
    }
  }
  const nem = byArm.get("nemotron");
  if (nem?.reviews) {
    lines.push("", "Nemotron's weekly reviews:", "");
    for (const r of nem.reviews) lines.push(`- Week ${r.week} (${r.provider}${r.model ? `, ${r.latencyMs} ms` : ""}): ${r.decisions.map((d) => `${d.kind} ${d.action}`).join(", ") || "no change"}${r.rejections.length ? ` — refused by code: ${r.rejections.map((j) => j.reason).join("; ")}` : ""}`);
    lines.push("", "Notes it wrote:", "", ...nem.reviews.flatMap((r) => r.notes.map((n) => `- Week ${n.week} (${n.source}): ${n.text}`)));
  }
  void TASK_KINDS;
  return lines.join("\n");
}

/**
 * The week-by-week trace: what the learner was shown, what it changed, and
 * whether next week's plans were actually better for it. This is the answer to
 * "does it learn something from one week and change the next one".
 */
export function traceMarkdown(x: ExperimentResult, arm: Arm = "weekly-nemotron"): string {
  const a = x.arms.find((y) => y.arm === arm);
  const raw = x.arms.find((y) => y.arm === "raw");
  if (!a?.lessons) return `no week-by-week trace for arm ${arm}`;
  const lines: string[] = [`# ${x.label} — week by week (${arm})`, "", `Student: ${x.student}. Each week is planned with what the learner knew *before* that week, then revealed to it.`, ""];
  lines.push("| Week | Sessions | Error with learning (min) | Error without (min) | Better? | What the learner changed |", "|---|---|---|---|---|---|");
  for (const l of a.lessons) {
    const mine = a.perWeek.find((w) => w.week === l.week)!;
    const none = raw?.perWeek.find((w) => w.week === l.week);
    const better = !none || l.week === 1 ? "—" : mine.mae < none.mae ? "yes" : mine.mae === none.mae ? "same" : "no";
    const changed = l.changes.length ? l.changes.map((c) => `${c.kind} ${c.from}→${c.to}`).join(", ") : "nothing";
    lines.push(`| ${l.week} | ${l.sessions.length} | ${mine.mae} | ${none?.mae ?? "—"} | ${better} | ${changed} |`);
  }
  for (const l of a.lessons) {
    lines.push("", `**Week ${l.week}** (${l.provider}${l.latencyMs ? `, ${l.latencyMs} ms` : ""})`, "");
    lines.push(...l.sessions.map((sn) => `- ${sn.title}: student estimated ${sn.estimate}, plan was ${sn.planned}, took ${sn.actual}`));
    if (l.changes.length) lines.push(...l.changes.map((c) => `- → ${KIND_LABEL[c.kind]}: ${c.from} to ${c.to}${c.clamped ? " (clamped)" : ""} — ${c.reason}`));
    else lines.push("- → no change");
    if (l.memo) lines.push(`- memo to itself: "${l.memo}"`);
  }
  if (a.learned) {
    lines.push("", "Where it ended up against the student's hidden truth:", "", "| Kind | Learned | Truth | Error |", "|---|---|---|---|");
    for (const t of a.learned) lines.push(`| ${KIND_LABEL[t.kind]} | ${t.learned} | ${t.truth} | ${t.error} |`);
  }
  return lines.join("\n");
}
