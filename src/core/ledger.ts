import type { DayProfile, FixedBlock, Task } from "./types";
import type { TravelGraph } from "./travel";
import { Estimator } from "./estimator";

export interface Ledger {
  awake: number;
  fixed: number;
  travel: number;
  meals: number;
  routines: number;
  queued: number;
  friction: number;
  usable: number;
  slack: number;
  overCommitted: boolean;
  /** What a naive calendar would claim: awake minus classes. */
  naiveFree: number;
}

export function travelMinutes(blocks: FixedBlock[], profile: DayProfile, travel: TravelGraph): number {
  const placed = blocks.filter((b) => b.place).sort((a, b) => a.start - b.start);
  if (placed.length === 0) return 0;
  let total = 0;
  let prev = profile.home;
  for (const b of placed) {
    total += travel.minutes(prev, b.place);
    prev = b.place!;
  }
  total += travel.minutes(prev, profile.home);
  return total;
}

export function computeLedger(
  blocks: FixedBlock[],
  profile: DayProfile,
  travel: TravelGraph,
  queued: Task[],
  estimator = new Estimator(),
): Ledger {
  const scheduled = blocks.filter((b) => b.kind !== "routine");
  const fixed = scheduled.reduce((s, b) => s + (b.end - b.start), 0);
  const trav = travelMinutes(scheduled, profile, travel);
  const routines = profile.morningRoutineMinutes + profile.windDownMinutes;
  const awake = profile.sleepStart - profile.wake;
  const queuedMin = queued.filter((q) => !q.completedAt).reduce((s, q) => s + estimator.planningMinutes(q), 0);
  const friction = trav + profile.mealMinutes + routines;
  const usable = awake - fixed - friction;
  return {
    awake,
    fixed,
    travel: trav,
    meals: profile.mealMinutes,
    routines,
    queued: queuedMin,
    friction,
    usable,
    slack: usable - queuedMin,
    overCommitted: usable - queuedMin < 0,
    naiveFree: awake - fixed,
  };
}

export interface Cut {
  task: Task;
  minutesSaved: number;
  reason: string;
}

/** Cheapest way back under budget: unprotected first, far deadlines first, biggest saving first. */
export function suggestCuts(tasks: Task[], deficit: number, protect: Set<string>, estimator = new Estimator(), now = new Date()): Cut[] {
  if (deficit <= 0) return [];
  const hours = (t: Task) => (t.dueAt ? (t.dueAt.getTime() - now.getTime()) / 36e5 : Number.POSITIVE_INFINITY);
  const cands = tasks
    .filter((t) => !t.completedAt && !t.isPriority)
    .sort((a, b) => {
      const pa = protect.has(a.domain), pb = protect.has(b.domain);
      if (pa !== pb) return pa ? 1 : -1;
      const fa = hours(a) > 48, fb = hours(b) > 48;
      if (fa !== fb) return fa ? -1 : 1;
      return estimator.planningMinutes(b) - estimator.planningMinutes(a);
    });
  const out: Cut[] = [];
  let remaining = deficit;
  for (const task of cands) {
    if (remaining <= 0) break;
    const saved = estimator.planningMinutes(task);
    const h = hours(task);
    const reason = !task.dueAt ? "no deadline" : h > 48 ? `not due for ${Math.floor(h / 24)} days` : !protect.has(task.domain) ? "not one of your priorities" : "due soon, cut this last";
    out.push({ task, minutesSaved: saved, reason });
    remaining -= saved;
  }
  return out;
}
