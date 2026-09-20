import type { DayProfile, FixedBlock, PlaceId, Task } from "./types";
import type { TravelGraph } from "./travel";
import { Estimator } from "./estimator";

export interface Gap {
  id: string;
  start: number;
  end: number;
  fromPlace?: PlaceId;
  toPlace?: PlaceId;
  usable: number;
  isEvening: boolean;
  /**
   * Where the window began before the clock ate into it, kept because the id
   * is derived from it. Only differs from `start` for a window already under
   * way.
   */
  plannedStart?: number;
  /** True when the window is running right now. */
  inProgress?: boolean;
}

export const SETTLE_MINUTES = 5;
/** Below this a gap is a coffee, not a work session. */
export const MIN_USABLE = 25;

/**
 * A window is identified by the minute it starts, not by its position in the
 * list. Positional ids ("gap-0") silently re-label a different window whenever
 * a class is added or cancelled, which makes any diff between two versions of
 * the day meaningless.
 */
export const gapId = (startMinutes: number) => `g${startMinutes}`;

/** Between-commitment holes with the walk and the settle-in already removed. */
/**
 * @param now Minutes from midnight. When given, windows already past are
 *   dropped and one under way is shortened to what is actually left.
 * @param minUsable How small a window may be and still count. Defaults to
 *   MIN_USABLE so every existing caller is unchanged; the mode config passes
 *   its own, which is the whole difference between Chill's 40 and Crisis's 12.
 */
export function findGaps(blocks: FixedBlock[], profile: DayProfile, travel: TravelGraph, now?: number, minUsable = MIN_USABLE): Gap[] {
  const dayStart = profile.wake + profile.morningRoutineMinutes;
  const dayEnd = profile.sleepStart - profile.windDownMinutes;
  const ordered = [...blocks].sort((a, b) => a.start - b.start);
  const out: Gap[] = [];
  let cursor = dayStart;
  let cursorPlace: PlaceId | undefined = profile.home;

  for (const b of ordered) {
    if (b.start <= cursor) {
      if (b.end > cursor) {
        cursor = b.end;
        cursorPlace = b.place;
      }
      continue;
    }
    const walk = travel.minutes(cursorPlace, b.place);
    const wStart = cursor === dayStart ? cursor : cursor + SETTLE_MINUTES;
    const wEnd = b.start - walk;
    if (wEnd - wStart >= minUsable) {
      out.push({ id: gapId(wStart), start: wStart, end: wEnd, fromPlace: cursorPlace, toPlace: b.place, usable: wEnd - wStart, isEvening: false });
    }
    cursor = b.end;
    cursorPlace = b.place;
  }

  const walkHome = travel.minutes(cursorPlace, profile.home);
  const tailStart = cursor === dayStart ? cursor : cursor + SETTLE_MINUTES;
  const tailEnd = dayEnd - walkHome;
  if (tailEnd - tailStart >= minUsable) {
    out.push({ id: gapId(tailStart), start: tailStart, end: tailEnd, fromPlace: cursorPlace, toPlace: profile.home, usable: tailEnd - tailStart, isEvening: true });
  }
  return now === undefined ? out : clipToNow(out, now, minUsable);
}

/**
 * Drop what has already gone, and shorten what is under way.
 *
 * Without this the plan is written at wake and never moves, so at seven in the
 * evening Orbit still offers "your best window is eleven oh five, three hours
 * sixteen" -- a window that closed five hours ago. Every number was correct
 * this morning, which is the worst kind of wrong: it looks exactly like the
 * truth.
 *
 * The id keeps coming from the *planned* start, not the clipped one. A window
 * that shrinks by a minute every minute is still the same window, and if its
 * id moved with the clock the Watcher would see one close and another open on
 * every single tick.
 */
export function clipToNow(gaps: Gap[], now: number, minUsable = MIN_USABLE): Gap[] {
  const out: Gap[] = [];
  for (const g of gaps) {
    if (g.end <= now) continue;                       // already gone
    if (g.start >= now) { out.push(g); continue; }    // still ahead, untouched
    const usable = g.end - now;
    if (usable < minUsable) continue;                 // what is left is a coffee
    out.push({ ...g, start: now, usable, plannedStart: g.start, inProgress: true });
  }
  return out;
}

export function betweenClassMinutes(gaps: Gap[]): number {
  return gaps.filter((g) => !g.isEvening).reduce((s, g) => s + g.usable, 0);
}

/** One task per gap, never a list. Priority first, then the soonest deadline, then the biggest that fits. */
export function bestFit(gap: Gap, tasks: Task[], estimator = new Estimator()): Task | undefined {
  const fits = tasks.filter((t) => !t.completedAt && estimator.planningMinutes(t) <= gap.usable);
  const due = (t: Task) => (t.dueAt ? t.dueAt.getTime() : Number.POSITIVE_INFINITY);
  return fits.sort((a, b) => {
    if ((a.isPriority ? 1 : 0) !== (b.isPriority ? 1 : 0)) return a.isPriority ? -1 : 1;
    if (due(a) !== due(b)) return due(a) - due(b);
    return estimator.planningMinutes(b) - estimator.planningMinutes(a);
  })[0];
}
