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
}

export const SETTLE_MINUTES = 5;
/** Below this a gap is a coffee, not a work session. */
export const MIN_USABLE = 25;

/** Between-commitment holes with the walk and the settle-in already removed. */
export function findGaps(blocks: FixedBlock[], profile: DayProfile, travel: TravelGraph): Gap[] {
  const dayStart = profile.wake + profile.morningRoutineMinutes;
  const dayEnd = profile.sleepStart - profile.windDownMinutes;
  const ordered = [...blocks].sort((a, b) => a.start - b.start);
  const out: Gap[] = [];
  let cursor = dayStart;
  let cursorPlace: PlaceId | undefined = profile.home;
  let i = 0;

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
    if (wEnd - wStart >= MIN_USABLE) {
      out.push({ id: `gap-${i++}`, start: wStart, end: wEnd, fromPlace: cursorPlace, toPlace: b.place, usable: wEnd - wStart, isEvening: false });
    }
    cursor = b.end;
    cursorPlace = b.place;
  }

  const walkHome = travel.minutes(cursorPlace, profile.home);
  const tailStart = cursor === dayStart ? cursor : cursor + SETTLE_MINUTES;
  const tailEnd = dayEnd - walkHome;
  if (tailEnd - tailStart >= MIN_USABLE) {
    out.push({ id: `gap-${i}`, start: tailStart, end: tailEnd, fromPlace: cursorPlace, toPlace: profile.home, usable: tailEnd - tailStart, isEvening: true });
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
