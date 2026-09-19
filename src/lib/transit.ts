import { STOP, rideMinutes, stopInfo } from "@/services/schedule";
import { upcomingArrivals, clock, type ArrivalDetail } from "@/services/prt";
import { fmt } from "@/core/time";

/**
 * Turns the schedule into the two questions a student actually has:
 *  - "When do I leave campus to get home?" (after the last class)
 *  - "When do I leave home to make my first class?" (morning)
 * Walk times are from the place map; ride time comes from the schedule itself.
 */
export const PLACES: Record<string, { boardOutbound?: string; alightInbound?: string; walkToStop: number }> = {
  Cathedral: { boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound, walkToStop: 3 },
  Hillman: { boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound, walkToStop: 3 },
  Posvar: { boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInbound, walkToStop: 4 },
  Sennott: { boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum, walkToStop: 3 },
  Benedum: { boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum, walkToStop: 5 },
  Home: { boardOutbound: STOP.homeInbound, alightInbound: STOP.homeOutbound, walkToStop: 4 },
};
const HOME_ROUTES = ["61A", "61B", "61C", "61D"];

export interface LegPlan {
  from: string; to: string; boardStop: string; boardStopName: string; alightStop: string;
  options: { route: string; headsign: string; departsText: string; departs: number; status: ArrivalDetail["status"]; leaveByText: string; leaveBy: number; arriveText: string; delaySec?: number }[];
  rideMinutes: number; walkToStop: number; realtimeOk: boolean; clockText: string; simulated: boolean;
}

export async function planLeg(from: keyof typeof PLACES, to: keyof typeof PLACES, mustArriveBySec?: number): Promise<LegPlan | undefined> {
  const c = clock();
  const goingHome = to === "Home";
  const boardStop = goingHome ? PLACES[from].boardOutbound : PLACES.Home.boardOutbound;
  const alightStop = goingHome ? PLACES.Home.alightInbound : PLACES[to].alightInbound;
  if (!boardStop || !alightStop) return undefined;
  const walk = goingHome ? PLACES[from].walkToStop : PLACES.Home.walkToStop;
  const routes = HOME_ROUTES;
  const ride = rideMinutes(boardStop, alightStop, c.ymd, c.sec) ?? 12;
  const { arrivals, realtimeOk } = await upcomingArrivals(boardStop, { routes, windowMin: 90, now: c });
  const options = arrivals
    .filter((a) => a.arrivalMinutes * 60 >= c.sec + walk * 60)
    .filter((a) => mustArriveBySec === undefined || (a.arrivalMinutes + ride) * 60 <= mustArriveBySec)
    .slice(0, 4)
    .map((a) => ({ route: a.route, headsign: a.headsign, departs: a.arrivalMinutes, departsText: fmt(a.arrivalMinutes), status: a.status, leaveBy: a.arrivalMinutes - walk - 2, leaveByText: fmt(a.arrivalMinutes - walk - 2), arriveText: fmt(a.arrivalMinutes + ride), delaySec: a.delaySec }));
  return { from, to, boardStop, boardStopName: stopInfo(boardStop)?.name ?? boardStop, alightStop, options, rideMinutes: ride, walkToStop: walk, realtimeOk, clockText: fmt(Math.floor(c.sec / 60)), simulated: c.simulated };
}
