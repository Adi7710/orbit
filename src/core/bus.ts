import type { Gap } from "./gaps";

export interface BusArrival { route: string; stopId: string; arrivalMinutes: number; realtime: boolean; vehicleId?: string }

export interface LeaveBy { route: string; leaveBy: number; arrival: number; walkToStop: number; slackAfter: number; ghost?: boolean }

/**
 * Given the end of a gap (or "now"), the walk to the stop, and upcoming
 * arrivals, pick the bus that gets you there with the least dead time and say
 * when to stand up. A scheduled trip with no vehicle on the realtime feed is
 * flagged as a ghost so the app never tells you to run for a bus that is not
 * coming.
 */
export function leaveBy(now: number, walkToStop: number, arrivals: BusArrival[], mustArriveBy?: number, rideMinutes = 0): LeaveBy | undefined {
  const feasible = arrivals
    .filter((a) => a.arrivalMinutes >= now + walkToStop)
    .filter((a) => mustArriveBy === undefined || a.arrivalMinutes + rideMinutes <= mustArriveBy)
    .sort((a, b) => a.arrivalMinutes - b.arrivalMinutes);
  const pick = feasible.find((a) => a.realtime) ?? feasible[0];
  if (!pick) return undefined;
  return {
    route: pick.route,
    arrival: pick.arrivalMinutes,
    walkToStop,
    leaveBy: pick.arrivalMinutes - walkToStop - 2,
    slackAfter: mustArriveBy === undefined ? 0 : mustArriveBy - (pick.arrivalMinutes + rideMinutes),
    ghost: !pick.realtime,
  };
}

/** Scheduled trips that should be visible on the realtime feed but are not. */
export function ghostTrips(scheduled: BusArrival[], realtime: BusArrival[], toleranceMin = 10): BusArrival[] {
  return scheduled.filter((s) => !realtime.some((r) => r.route === s.route && Math.abs(r.arrivalMinutes - s.arrivalMinutes) <= toleranceMin));
}

export function busQuestForGap(gap: Gap, walkToStop: number, arrivals: BusArrival[], rideMinutes: number) {
  const lb = leaveBy(gap.start, walkToStop, arrivals, gap.end, rideMinutes);
  return lb ? { gapId: gap.id, leaveBy: lb.leaveBy, route: lb.route } : undefined;
}
