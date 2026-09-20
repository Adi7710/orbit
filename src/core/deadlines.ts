import type { Gap } from "./gaps";
import { Estimator } from "./estimator";
import type { Task } from "./types";

/**
 * What is due, whether it fits, and where the work goes.
 *
 * All of this is pure arithmetic over windows that already exist. There is no
 * new Deadline entity: a deadline is an Orbit task that has a `dueAt`, so
 * anything imported from Canvas or lifted off a syllabus is already one, and
 * nothing has to be entered twice.
 *
 * Effort is the *calibrated* estimate, not the raw one. A student who
 * consistently runs 1.6x over on problem sets is told the truth about whether
 * four of them fit before Friday, which is the entire point of the ledger
 * applied one day further out.
 *
 * Times are minutes from today's midnight and may run past 1440 for later
 * days, the convention `Minutes` in time.ts already sets and `sleepStart`
 * already uses for a 00:30 bedtime.
 */

export interface Deadline {
  id: string;
  title: string;
  /** Minutes from today's midnight; may exceed 1440. */
  due: number;
  estimatedEffortMin: number;
  remainingEffortMin: number;
  courseCode?: string;
}

export interface WorkBlock {
  deadlineId: string;
  title: string;
  gapId: string;
  start: number;
  end: number;
  minutes: number;
  /** True when this block finishes the deadline rather than chipping at it. */
  completes: boolean;
}

export interface DeadlineVerdict {
  id: string;
  title: string;
  due: number;
  fits: boolean;
  slackMin: number;
}

export interface Feasibility {
  needMin: number;
  haveMin: number;
  shortfallMin: number;
  message: string;
  deadlines: DeadlineVerdict[];
}

/** Minutes from today's midnight for an absolute instant. */
export const dueMinutes = (dueAt: Date, todayMidnight: Date): number =>
  Math.round((dueAt.getTime() - todayMidnight.getTime()) / 60000);

/**
 * Tasks with a due date, as deadlines, newest information first.
 *
 * A task with no `dueAt` is work, not a deadline, and inventing a deadline for
 * it would make the feasibility meter claim a shortfall that does not exist.
 */
export function deadlinesFromTasks(tasks: Task[], todayMidnight: Date, estimator = new Estimator()): Deadline[] {
  return tasks
    .filter((t) => !t.completedAt && t.dueAt)
    .map((t) => {
      const planned = estimator.planningMinutes(t);
      return {
        id: t.id,
        title: t.title,
        due: dueMinutes(t.dueAt!, todayMidnight),
        estimatedEffortMin: t.estimateMinutes,
        remainingEffortMin: planned,
        courseCode: t.courseCode,
      };
    })
    .sort((a, b) => a.due - b.due);
}

/** Only what is due within the horizon. null means no horizon at all. */
export function deadlinesWithinHorizon(deadlines: Deadline[], now: number, horizonHours: number | null): Deadline[] {
  if (horizonHours === null) return deadlines;
  const limit = now + horizonHours * 60;
  return deadlines.filter((d) => d.due <= limit);
}

/** Usable minutes in the day's windows between `now` and `before`. */
export function availableMinutesBefore(gaps: Gap[], now: number, before: number): number {
  return gaps.reduce((sum, g) => sum + Math.max(0, Math.min(g.end, before) - Math.max(g.start, now)), 0);
}

/** Minutes spare once this deadline is done, ignoring everything else. Negative means it cannot fit. */
export const computeSlack = (d: Deadline, gaps: Gap[], now: number): number =>
  availableMinutesBefore(gaps, now, d.due) - d.remainingEffortMin;

/** Tightest first, then soonest. What to open with when the day is a triage. */
export function rankDeadlines(deadlines: Deadline[], gaps: Gap[], now: number): Deadline[] {
  return [...deadlines].sort((a, b) => {
    const sa = computeSlack(a, gaps, now), sb = computeSlack(b, gaps, now);
    if (sa !== sb) return sa - sb;
    return a.due - b.due;
  });
}

/**
 * Put the work in the windows, soonest deadline first.
 *
 * A deadline is split across consecutive windows rather than dropped when no
 * single window holds it, because "no window is big enough for your essay" is
 * true and useless. A block never exceeds what is left of its window, and
 * windows below the mode's threshold are not used at all.
 */
export function assignWorkBlocks(deadlines: Deadline[], gaps: Gap[], now: number, minUsableGap: number): WorkBlock[] {
  const usable = gaps
    .filter((g) => g.usable >= minUsableGap && g.end > now)
    .map((g) => ({ gap: g, cursor: Math.max(g.start, now) }))
    .sort((a, b) => a.cursor - b.cursor);

  const out: WorkBlock[] = [];
  for (const d of [...deadlines].sort((a, b) => a.due - b.due)) {
    let left = d.remainingEffortMin;
    for (const slot of usable) {
      if (left <= 0) break;
      // Work after the thing is due is not work towards it.
      const limit = Math.min(slot.gap.end, d.due);
      const free = limit - slot.cursor;
      if (free <= 0) continue;
      const minutes = Math.min(free, left);
      out.push({
        deadlineId: d.id,
        title: d.title,
        gapId: slot.gap.id,
        start: slot.cursor,
        end: slot.cursor + minutes,
        minutes,
        completes: minutes === left,
      });
      slot.cursor += minutes;
      left -= minutes;
    }
  }
  return out;
}

/**
 * Need versus have, honestly compounded.
 *
 * Walked soonest-first with each deadline consuming the minutes ahead of it,
 * so a later deadline only has what the earlier ones leave. Scoring each
 * deadline against the whole day independently is the flattering version: four
 * things that each "fit" in the same eight hours do not fit.
 */
export function computeFeasibility(deadlines: Deadline[], gaps: Gap[], now: number): Feasibility {
  const ordered = [...deadlines].sort((a, b) => a.due - b.due);
  const verdicts: DeadlineVerdict[] = [];
  let consumed = 0;
  let needMin = 0;

  for (const d of ordered) {
    needMin += d.remainingEffortMin;
    const available = availableMinutesBefore(gaps, now, d.due) - consumed;
    const slackMin = available - d.remainingEffortMin;
    verdicts.push({ id: d.id, title: d.title, due: d.due, fits: slackMin >= 0, slackMin });
    consumed += d.remainingEffortMin;
  }

  const last = ordered[ordered.length - 1];
  const haveMin = last ? availableMinutesBefore(gaps, now, last.due) : 0;
  const shortfallMin = Math.max(0, needMin - haveMin);
  const missing = verdicts.filter((v) => !v.fits);

  const message = !ordered.length
    ? "Nothing is due. The day is yours."
    : shortfallMin === 0 && !missing.length
      ? `All ${ordered.length} fit, with ${haveMin - needMin} min to spare.`
      : missing.length === 1
        ? `${missing[0].title} does not fit: ${Math.abs(missing[0].slackMin)} min short.`
        : `${missing.length} of ${ordered.length} do not fit. You are ${shortfallMin || Math.abs(missing[0].slackMin)} min short.`;

  return { needMin, haveMin, shortfallMin, message, deadlines: verdicts };
}

/**
 * A copyable message asking for more time. Never sent, and never sent from
 * here: Orbit holds no mailbox credential, and the existing Email Agent is the
 * only thing that puts a draft in front of a human.
 */
export function draftExtensionRequest(d: Deadline, shortfallMin: number, studentName = "your student"): string {
  const hours = Math.max(1, Math.round(shortfallMin / 60));
  return [
    `Subject: ${d.courseCode ? `${d.courseCode}: ` : ""}${d.title} — asking for a short extension`,
    "",
    `I am working through what is due this week and, being honest about the time I actually have between classes, I am about ${hours} hour${hours === 1 ? "" : "s"} short on ${d.title}.`,
    "",
    "I would rather tell you now than hand in something rushed. Would a short extension be possible?",
    "",
    `Thank you,`,
    studentName,
  ].join("\n");
}
