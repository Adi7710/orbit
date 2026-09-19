import type { Domain } from "./types";
import { fromDate, dayKey } from "./time";

/**
 * What the student's own history says about how they work. Pure arithmetic over
 * completed sessions: no network, no model. The model only ever sees these
 * numbers and may only cite them (see verifyInsight), so a made-up habit cannot
 * reach the screen.
 */
export type TimeBucket = "morning" | "midday" | "evening" | "late";
export const BUCKETS: TimeBucket[] = ["morning", "midday", "evening", "late"];
export const BUCKET_LABEL: Record<TimeBucket, string> = { morning: "before noon", midday: "between noon and 5 PM", evening: "between 5 and 10 PM", late: "after 10 PM" };
export const DOMAIN_LABEL: Record<Domain, string> = { learn: "Reading and studying", build: "Graded work", body: "Exercise", life: "Errands" };

const TZ = "America/New_York";
/** Fewest sessions a bucket or domain needs before we say anything about it. */
export const MIN_SESSIONS = 3;
/** Best and worst bucket must differ by at least this much pace before "best window" is claimed. */
export const MIN_PACE_GAP = 0.15;
export const OVERRUN_FLAG = 1.25;

export interface HabitRecord {
  taskId: string;
  title: string;
  domain: Domain;
  courseCode?: string;
  /** The student's own estimate, before calibration. */
  plannedMinutes: number;
  actualMinutes: number;
  completedAt: Date;
  /** Done inside a gap the planner found. */
  inGap: boolean;
  dueAt?: Date;
  /** True for the seeded demo history; never true for a real completion. */
  synthetic?: boolean;
  /** Filled by the synthetic student so the weekly learner can replay history week by week. */
  week?: number;
  /** How long before the deadline the student actually started, in hours (procrastination). */
  startedHoursBeforeDue?: number;
}

export interface BucketStat { bucket: TimeBucket; sessions: number; /** actual / estimate, mean */ meanRatio: number; /** 1 = your normal pace for that kind of task, below 1 = faster */ pace: number }
export interface DomainStat { domain: Domain; sessions: number; meanRatio: number }
export interface HabitProfile {
  sessions: number;
  activeDays: number;
  overallRatio: number;
  inGapShare: number;
  byBucket: BucketStat[];
  byDomain: DomainStat[];
  best?: { bucket: TimeBucket; pace: number; sessions: number };
  worst?: { bucket: TimeBucket; pace: number; sessions: number };
  deadline?: { tasks: number; medianHoursBefore: number; style: "early" | "steady" | "last-minute" };
}

/** Bucket of the moment the session started (completion minus duration), in the student's zone. */
export function bucketOf(completedAt: Date, actualMinutes: number, tz = TZ): TimeBucket {
  const start = (((fromDate(completedAt, tz) - actualMinutes) % 1440) + 1440) % 1440;
  if (start < 12 * 60) return "morning";
  if (start < 17 * 60) return "midday";
  if (start < 22 * 60) return "evening";
  return "late";
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function buildHabitProfile(records: HabitRecord[], tz = TZ): HabitProfile {
  const usable = records.filter((r) => r.plannedMinutes > 0 && r.actualMinutes > 0);
  const ratio = (r: HabitRecord) => r.actualMinutes / r.plannedMinutes;

  const domains = [...new Set(usable.map((r) => r.domain))];
  const byDomain: DomainStat[] = domains.map((d) => {
    const rs = usable.filter((r) => r.domain === d);
    return { domain: d, sessions: rs.length, meanRatio: mean(rs.map(ratio)) };
  });
  const domainMean = new Map(byDomain.map((d) => [d.domain, d.meanRatio]));

  const byBucket: BucketStat[] = [];
  for (const b of BUCKETS) {
    const rs = usable.filter((r) => bucketOf(r.completedAt, r.actualMinutes, tz) === b);
    if (rs.length === 0) continue;
    byBucket.push({
      bucket: b,
      sessions: rs.length,
      meanRatio: mean(rs.map(ratio)),
      // Ratio against the same domain's own average, so a bucket full of easy tasks is not called fast.
      pace: mean(rs.map((r) => ratio(r) / (domainMean.get(r.domain) ?? 1))),
    });
  }

  const eligible = byBucket.filter((b) => b.sessions >= MIN_SESSIONS);
  let best: HabitProfile["best"], worst: HabitProfile["worst"];
  if (eligible.length >= 2) {
    const sorted = [...eligible].sort((a, b) => a.pace - b.pace);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (hi.pace - lo.pace >= MIN_PACE_GAP) {
      best = { bucket: lo.bucket, pace: lo.pace, sessions: lo.sessions };
      worst = { bucket: hi.bucket, pace: hi.pace, sessions: hi.sessions };
    }
  }

  const due = usable.filter((r) => r.dueAt);
  let deadline: HabitProfile["deadline"];
  if (due.length >= MIN_SESSIONS) {
    const h = median(due.map((r) => (r.dueAt!.getTime() - r.completedAt.getTime()) / 36e5));
    deadline = { tasks: due.length, medianHoursBefore: h, style: h >= 24 ? "early" : h >= 6 ? "steady" : "last-minute" };
  }

  return {
    sessions: usable.length,
    activeDays: new Set(usable.map((r) => dayKey(r.completedAt, tz))).size,
    overallRatio: usable.length ? mean(usable.map(ratio)) : 1,
    inGapShare: usable.length ? usable.filter((r) => r.inGap).length / usable.length : 0,
    byBucket,
    byDomain,
    best,
    worst,
    deadline,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every number and label an insight is allowed to cite, under a stable key. */
export function flattenStats(p: HabitProfile): Record<string, number | string> {
  const o: Record<string, number | string> = { sessions: p.sessions, activeDays: p.activeDays, overallRatio: r2(p.overallRatio), inGapShare: r2(p.inGapShare) };
  for (const b of p.byBucket) { o[`bucket.${b.bucket}.sessions`] = b.sessions; o[`bucket.${b.bucket}.meanRatio`] = r2(b.meanRatio); o[`bucket.${b.bucket}.pace`] = r2(b.pace); }
  for (const d of p.byDomain) { o[`domain.${d.domain}.sessions`] = d.sessions; o[`domain.${d.domain}.meanRatio`] = r2(d.meanRatio); }
  if (p.best && p.worst) { o["best.bucket"] = p.best.bucket; o["best.pace"] = r2(p.best.pace); o["worst.bucket"] = p.worst.bucket; o["worst.pace"] = r2(p.worst.pace); }
  if (p.deadline) { o["deadline.tasks"] = p.deadline.tasks; o["deadline.medianHoursBefore"] = r2(p.deadline.medianHoursBefore); o["deadline.style"] = p.deadline.style; }
  return o;
}

export type InsightKind = "best_window" | "overrun" | "deadline_style" | "in_gap";
export interface Insight {
  kind: InsightKind;
  text: string;
  suggestion: string;
  /** stat key -> the value the text relies on; checked against the profile. */
  evidence: Record<string, number | string>;
}

const pct = (x: number) => Math.round(x * 100);
const num = (n: number) => String(r2(n));

/** Insights written by code. This is what shows with no API key, and what the model's answer is checked against. */
export function deterministicInsights(p: HabitProfile, max = 3): Insight[] {
  const flat = flattenStats(p);
  const out: Insight[] = [];
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter((k) => k in flat).map((k) => [k, flat[k]]));

  if (p.best && p.worst) {
    const faster = pct(1 - p.best.pace), slower = pct(p.worst.pace - 1);
    out.push({
      kind: "best_window",
      text: `You work about ${faster}% faster ${BUCKET_LABEL[p.best.bucket]} than your usual pace for the same kind of task${slower > 0 ? `, and about ${slower}% slower ${BUCKET_LABEL[p.worst.bucket]}` : ""}.`,
      suggestion: `Put your hardest task in a gap ${BUCKET_LABEL[p.best.bucket]}.`,
      evidence: pick("best.bucket", "best.pace", "worst.bucket", "worst.pace"),
    });
  }

  const overrun = p.byDomain.filter((d) => d.sessions >= MIN_SESSIONS && d.meanRatio >= OVERRUN_FLAG).sort((a, b) => b.meanRatio - a.meanRatio)[0];
  if (overrun) {
    out.push({
      kind: "overrun",
      text: `${DOMAIN_LABEL[overrun.domain]} takes you ${num(overrun.meanRatio)}x what you estimate.`,
      suggestion: `Plan about ${pct(overrun.meanRatio - 1)}% more time for it.`,
      evidence: pick(`domain.${overrun.domain}.meanRatio`, `domain.${overrun.domain}.sessions`),
    });
  }

  if (p.deadline && p.deadline.style !== "early") {
    const h = num(p.deadline.medianHoursBefore);
    out.push({
      kind: "deadline_style",
      text: p.deadline.style === "last-minute" ? `You usually finish graded work only ${h} hours before it is due.` : `You usually finish graded work ${h} hours before it is due.`,
      suggestion: "Start it one gap earlier so a bad evening does not cost you the deadline.",
      evidence: pick("deadline.medianHoursBefore", "deadline.style", "deadline.tasks"),
    });
  }

  if (p.sessions >= 6 && p.inGapShare < 0.5) {
    out.push({
      kind: "in_gap",
      text: `Only ${pct(p.inGapShare)}% of your finished work happens inside the gaps Orbit finds.`,
      suggestion: "Try finishing the one task Orbit picks for your next gap.",
      evidence: pick("inGapShare", "sessions"),
    });
  }
  return out.slice(0, max);
}

/** Numbers a sentence may legitimately contain, given its evidence: the values, their roundings, and the percent forms. */
function allowedNumbers(evidence: Record<string, number | string>): number[] {
  const out: number[] = [];
  for (const v of Object.values(evidence)) {
    if (typeof v !== "number") continue;
    out.push(v, Math.round(v), r2(v), pct(v), pct(Math.abs(1 - v)), pct(Math.abs(v - 1)), Math.round(v * 10) / 10);
  }
  return out;
}

/**
 * Why an insight fails verification, or undefined when it passes: every evidence
 * entry must match the real profile, and every number in the text or suggestion
 * must be one of the cited values (or their percent forms). The model can
 * phrase things; it cannot invent a statistic.
 */
export function whyRejected(i: Insight, p: HabitProfile): string | undefined {
  const flat = flattenStats(p);
  const keys = Object.keys(i.evidence ?? {});
  if (keys.length === 0) return "no evidence cited";
  for (const k of keys) {
    const real = flat[k], said = i.evidence[k];
    if (real === undefined) return `unknown stat "${k}"`;
    if (typeof real === "number") { if (typeof said !== "number" || Math.abs(real - said) > 0.011) return `"${k}" is ${real}, not ${said}`; }
    else if (real !== said) return `"${k}" is ${real}, not ${said}`;
  }
  const allowed = allowedNumbers(i.evidence);
  // Clock times ("5 PM", "5 to 10 PM", "5-10 PM") are labels, not statistics.
  const prose = `${i.text} ${i.suggestion}`.replace(/\b\d{1,2}(?::\d{2})?(?:\s*(?:and|to|[-\u2013\u2014])\s*\d{1,2}(?::\d{2})?)?\s*(?:AM|PM)\b/gi, " ");
  const stray = (prose.match(/\d+(?:\.\d+)?/g) ?? []).find((c) => !allowed.some((a) => Math.abs(a - Number(c)) < 0.011));
  return stray === undefined ? undefined : `the number ${stray} is not in the evidence`;
}

export const verifyInsight = (i: Insight, p: HabitProfile): boolean => whyRejected(i, p) === undefined;
