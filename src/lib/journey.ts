import { STOP, departuresAt, rideMinutes, stopInfo, routeShape, isFeedValid } from "@/services/schedule";
import { clock, realtimeIndex, type Clock } from "@/services/prt";
import { vehiclePositions, type VehiclePosition } from "@/services/vehicles";
import { decodePolyline, haversineMeters, nearestIndex, pathMeters, walkMinutes, type LatLon } from "@/core/geo";
import { fmt } from "@/core/time";

/**
 * Everything a map needs to show one trip: where you are, the stop, each
 * candidate bus (with its live position), the ride, the walk at the far end,
 * and the verdict for the class you are trying to make. The map is pure
 * rendering; all timing lives here.
 */
export const BUILDINGS: Record<string, LatLon & { boardOutbound?: string; alightInbound?: string }> = {
  Cathedral: { lat: 40.4443, lon: -79.9532, boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound },
  Hillman: { lat: 40.4425, lon: -79.9537, boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound },
  Posvar: { lat: 40.4416, lon: -79.9536, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInbound },
  Sennott: { lat: 40.4414, lon: -79.9563, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum },
  Benedum: { lat: 40.4437, lon: -79.9587, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum },
  Home: { lat: 40.4372, lon: -79.9230, boardOutbound: STOP.homeInbound, alightInbound: STOP.homeOutbound }, // Squirrel Hill, Murray + Darlington
};
const HOME_ROUTES = ["61A", "61B", "61C", "61D"];

export interface Walk { minutes: number; meters: number; polyline: [number, number][]; source: "google" | "estimate" }

export interface BusOption {
  route: string; headsign: string; tripId: string; dir: number;
  departsSec: number; departsText: string; scheduledText: string; status: "live" | "scheduled" | "ghost"; delaySec?: number;
  vehicle?: { id: string; lat: number; lon: number; bearing?: number; ageSec: number; metersToStop: number; stopsAway?: number };
  leaveBySec: number; leaveByText: string; rideMinutes: number; alightSec: number; arriveSec: number; arriveText: string;
  verdict: { makesIt: boolean; marginMin: number };
  shape: [number, number][]; // route polyline trimmed from the bus (or board stop) to the alight stop
}

export interface Journey {
  clock: Clock & { text: string };
  origin: LatLon & { label: string };
  destination: LatLon & { label: string; arriveBySec?: number; arriveByText?: string };
  boardStop: LatLon & { id: string; name: string };
  alightStop: LatLon & { id: string; name: string };
  walkToStop: Walk;
  walkToDest: Walk;
  options: BusOption[];
  realtime: { tripsOk: boolean; vehiclesOk: boolean };
  feedValid: boolean;
}

async function walk(a: LatLon, b: LatLon): Promise<Walk> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline" },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: a.lat, longitude: a.lon } } }, destination: { location: { latLng: { latitude: b.lat, longitude: b.lon } } }, travelMode: "WALK" }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const j = (await res.json()) as { routes?: { duration: string; distanceMeters: number; polyline: { encodedPolyline: string } }[] };
        const r = j.routes?.[0];
        if (r) return { minutes: Math.max(1, Math.round(parseInt(r.duration) / 60)), meters: r.distanceMeters, polyline: decodePolyline(r.polyline.encodedPolyline), source: "google" };
      }
    } catch { /* fall through to estimate */ }
  }
  return { minutes: walkMinutes(a, b), meters: Math.round(haversineMeters(a, b) * 1.3), polyline: [[a.lat, a.lon], [b.lat, b.lon]], source: "estimate" };
}

export async function buildJourney(opts: { origin?: LatLon; from: keyof typeof BUILDINGS; to: keyof typeof BUILDINGS; arriveBySec?: number; now?: Clock }): Promise<Journey | undefined> {
  const c = opts.now ?? clock();
  const goingHome = opts.to === "Home";
  const fromB = BUILDINGS[opts.from], toB = BUILDINGS[opts.to];
  const boardId = goingHome ? fromB.boardOutbound : BUILDINGS.Home.boardOutbound;
  const alightId = goingHome ? BUILDINGS.Home.alightInbound : toB.alightInbound;
  if (!boardId || !alightId) return undefined;
  const bs = stopInfo(boardId), as = stopInfo(alightId);
  if (!bs || !as) return undefined;
  const origin = { ...(opts.origin ?? fromB), label: opts.origin ? "You" : opts.from };
  const boardStop = { id: bs.id, name: bs.name, lat: bs.lat, lon: bs.lon };
  const alightStop = { id: as.id, name: as.name, lat: as.lat, lon: as.lon };

  const [walkToStop, walkToDest] = await Promise.all([walk(origin, boardStop), walk(alightStop, toB)]);
  const feedValid = isFeedValid(c.ymd);
  const sched = feedValid ? departuresAt(boardId, c.ymd, c.sec - 60, 90 * 60, HOME_ROUTES) : [];
  const ride = rideMinutes(boardId, alightId, c.ymd, c.sec) ?? 12;
  const live = c.simulated ? { index: new Map(), ok: false } : await realtimeIndex();
  const veh = c.simulated ? { byTrip: new Map<string, VehiclePosition>(), ok: false } : await vehiclePositions();

  const options: BusOption[] = [];
  for (const d of sched) {
    const rt = live.index.get(d.trip);
    const liveEpoch = rt?.stops.get(boardId);
    const schedEpoch = c.epoch - c.sec + d.sec;
    const departsSec = liveEpoch ? d.sec + (liveEpoch - schedEpoch) : d.sec;
    if (departsSec < c.sec + walkToStop.minutes * 60) continue; // cannot make this one
    const started = d.tripStart + 180 < c.sec;
    const status: BusOption["status"] = liveEpoch ? "live" : live.ok && started && !rt ? "ghost" : "scheduled";
    const fullShape = routeShape(d.route, d.dir);
    const bi = fullShape.length ? nearestIndex(fullShape, boardStop) : 0;
    const ai = fullShape.length ? nearestIndex(fullShape, alightStop) : 0;
    const v = veh.byTrip.get(d.trip);
    let vehicle: BusOption["vehicle"];
    let shape = fullShape.length && ai > bi ? fullShape.slice(bi, ai + 1) : [[boardStop.lat, boardStop.lon], [alightStop.lat, alightStop.lon]] as [number, number][];
    if (v) {
      const vi = fullShape.length ? nearestIndex(fullShape, v) : 0;
      const metersToStop = fullShape.length && vi <= bi ? pathMeters(fullShape, vi, bi) : haversineMeters(v, boardStop);
      vehicle = { id: v.vehicleId, lat: v.lat, lon: v.lon, bearing: v.bearing, ageSec: Math.max(0, c.epoch - v.timestamp), metersToStop: Math.round(metersToStop) };
      if (fullShape.length && vi < ai) shape = fullShape.slice(vi, ai + 1);
    }
    const alightSec = departsSec + ride * 60;
    const arriveSec = alightSec + walkToDest.minutes * 60;
    const margin = opts.arriveBySec === undefined ? 0 : Math.round((opts.arriveBySec - arriveSec) / 60);
    options.push({
      route: d.route, headsign: d.headsign, tripId: d.trip, dir: d.dir,
      departsSec, departsText: fmt(Math.floor(departsSec / 60)), scheduledText: fmt(Math.floor(d.sec / 60)), status, delaySec: liveEpoch ? liveEpoch - schedEpoch : undefined,
      vehicle, leaveBySec: departsSec - walkToStop.minutes * 60 - 120, leaveByText: fmt(Math.floor((departsSec - walkToStop.minutes * 60 - 120) / 60)),
      rideMinutes: ride, alightSec, arriveSec, arriveText: fmt(Math.floor(arriveSec / 60)),
      verdict: { makesIt: opts.arriveBySec === undefined ? true : arriveSec <= opts.arriveBySec, marginMin: margin },
      shape,
    });
  }
  // Live delays reorder buses; sort by when they actually leave and keep the next four.
  options.sort((a, b) => a.departsSec - b.departsSec);
  options.splice(4);

  return {
    clock: { ...c, text: fmt(Math.floor(c.sec / 60)) },
    origin,
    destination: { ...toB, label: opts.to, arriveBySec: opts.arriveBySec, arriveByText: opts.arriveBySec === undefined ? undefined : fmt(Math.floor(opts.arriveBySec / 60)) },
    boardStop, alightStop, walkToStop, walkToDest, options,
    realtime: { tripsOk: live.ok, vehiclesOk: veh.ok },
    feedValid,
  };
}
