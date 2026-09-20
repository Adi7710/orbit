import { STOP, REGION, bestStopPair, departuresAt, rideMinutes, stopInfo, routeShape, isFeedValid } from "@/services/schedule";
import { clock, realtimeIndex, type Clock } from "@/services/prt";
import { vehiclePositions, type VehiclePosition } from "@/services/vehicles";
import { decodePolyline, haversineMeters, nearestIndex, pathMeters, walkMinutes, type LatLon } from "@/core/geo";
import { fmt } from "@/core/time";
import { alertsFor, serviceAlerts, type ServiceAlert } from "@/services/alerts";
import { nextFrom, pathCodeForStopName, pathDepartures, type PathDeparture } from "@/services/path";

/**
 * Everything a map needs to show one trip: where you are, the stop, each
 * candidate bus (with its live position), the ride, the walk at the far end,
 * and the verdict for the class you are trying to make. The map is pure
 * rendering; all timing lives here.
 */
/**
 * Pittsburgh: Pitt's Oakland campus, with Squirrel Hill as home.
 * Kept whole because every transit test is pinned to this slice.
 */
const OAKLAND_PLACES: Record<string, LatLon & { boardOutbound?: string; alightInbound?: string }> = {
  Cathedral: { lat: 40.4443, lon: -79.9532, boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound },
  Hillman: { lat: 40.4425, lon: -79.9537, boardOutbound: STOP.campusOutbound, alightInbound: STOP.campusInbound },
  Posvar: { lat: 40.4416, lon: -79.9536, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInbound },
  Sennott: { lat: 40.4414, lon: -79.9563, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum },
  Benedum: { lat: 40.4437, lon: -79.9587, boardOutbound: STOP.campusOutboundSennott, alightInbound: STOP.campusInboundBenedum },
  Home: { lat: 40.4372, lon: -79.9230, boardOutbound: STOP.homeInbound, alightInbound: STOP.homeOutbound },
};

/**
 * Hudson County: Stevens on Castle Point, with home in downtown Jersey City.
 *
 * Coordinates are campus-accurate to roughly fifty metres, which is well
 * inside the noise on a walk time. The one that matters is Babbio: the School
 * of Business sits on the waterfront at the bottom of the hill, so it is a
 * materially different walk from Hoboken Terminal than the academic buildings
 * up on Castle Point -- and FE 570, FE 621 and MGT 808 all meet there.
 *
 * No board/alight stops are listed on purpose. bestStopPair resolves them from
 * the feed, which is the whole reason that function exists.
 */
const HUDSON_PLACES: Record<string, LatLon & { boardOutbound?: string; alightInbound?: string }> = {
  Babbio: { lat: 40.7434, lon: -74.0243 },        // Babbio Center, School of Business
  Gateway: { lat: 40.7455, lon: -74.0245 },       // Gateway Academic Center
  Howe: { lat: 40.7447, lon: -74.0251 },          // Howe Center
  Burchard: { lat: 40.7452, lon: -74.0254 },      // Burchard Building
  Library: { lat: 40.7441, lon: -74.0248 },       // Samuel C. Williams Library
  HobokenTerminal: { lat: 40.7349, lon: -74.0290 },
  Home: { lat: 40.7196, lon: -74.0430 },          // downtown Jersey City, by Grove Street
};

export const BUILDINGS = REGION === "oakland" ? OAKLAND_PLACES : HUDSON_PLACES;

/**
 * Fallback routes for the case where bestStopPair finds no served pair. Only
 * reached when the student is nowhere near a stop we hold.
 */
const HOME_ROUTES = REGION === "oakland" ? ["61A", "61B", "61C", "61D"] : ["HBLR", "Hoboken - 33rd Street", "Hoboken - World Trade Center"];

export interface Walk { minutes: number; meters: number; polyline: [number, number][]; source: "google" | "estimate" }

export type Confidence = "high" | "medium" | "low";

/**
 * How much to trust one departure, and why.
 *
 * Not decoration. "The 61B is at 20:33" reads identically whether it came from
 * a bus four hundred metres away or from a timetable printed in August, and a
 * student who misses a class because of the second one stops believing the
 * first. Showing the difference is the honest version of a prediction.
 *
 *  - **high**   a vehicle is reporting and it is close, or the feed predicts
 *               both ends of the ride.
 *  - **medium** the trip is reporting but without a position, or it is far
 *               enough out that a live prediction will still drift.
 *  - **low**    pure timetable, or a ghost -- a trip that should be on the
 *               road and is not in the feed at all.
 */
export function confidenceOf(x: { status: "live" | "scheduled" | "ghost"; vehicle?: { metersToStop: number; ageSec: number }; liveAlight: boolean; secondsAway: number }): Confidence {
  if (x.status === "ghost") return "low";
  if (x.status === "scheduled") return x.secondsAway < 20 * 60 ? "medium" : "low";
  // A position older than two minutes is a stale fix, not a live one.
  const fresh = x.vehicle && x.vehicle.ageSec <= 120;
  if (fresh && x.vehicle!.metersToStop < 3000) return "high";
  if (x.liveAlight && x.secondsAway < 30 * 60) return "high";
  return "medium";
}

export interface BusOption {
  route: string; headsign: string; tripId: string; dir: number;
  departsSec: number; departsText: string; scheduledText: string; status: "live" | "scheduled" | "ghost"; delaySec?: number;
  vehicle?: { id: string; lat: number; lon: number; bearing?: number; ageSec: number; metersToStop: number; stopsAway?: number };
  leaveBySec: number; leaveByText: string; rideMinutes: number; rideIsLive: boolean; confidence: Confidence; alightSec: number; arriveSec: number; arriveText: string;
  /** Only when there is a class to be late for. Null means nothing to miss. */
  verdict: { makesIt: boolean; marginMin: number } | null;
  /** Door to door, leaving now: the number a person actually wants. */
  totalMinutes: number;
  /** Time standing at the stop. Invisible in an itinerary that only lists legs. */
  waitMinutes: number;
  /** PRT says this route is out of service. Shown, never recommended. */
  suspended?: boolean;
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
  realtime: { tripsOk: boolean; vehiclesOk: boolean; alertsOk: boolean };
  feedValid: boolean;
  /** Live PRT service alerts touching these routes or stops, stop moves first. */
  alerts: ServiceAlert[];
  /**
   * True when no single trip runs between these stops. Orbit does not plan
   * transfers, and saying "no bus" when the real answer is "no bus without
   * changing" is the kind of wrong that sends somebody walking for an hour.
   */
  noDirectRoute: boolean;
  /**
   * Live PATH trains from the boarding station, when it is one.
   *
   * Kept beside the scheduled options rather than merged into them: PATH's
   * board publishes no trip ids, so there is no honest way to attach "4 min"
   * to a particular timetable row. NJ Transit's realtime, which would cover
   * the light rail, needs a developer account we do not have -- so in Hudson
   * County PATH is live, the light rail is a timetable, and the app says which.
   */
  pathLive?: { station: string; ok: boolean; departures: PathDeparture[] };
}

/**
 * Walking legs are between fixed points -- a building and a stop -- so the
 * answer never changes. Without this every journey request spent two Google
 * Routes calls and up to ten seconds of latency re-deriving the same 193
 * metres, and the map polls.
 */
const walkCache = new Map<string, Walk>();
const walkKey = (a: LatLon, b: LatLon) => `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;

async function walk(a: LatLon, b: LatLon): Promise<Walk> {
  const k = walkKey(a, b);
  const hit = walkCache.get(k);
  if (hit) return hit;
  const fresh = await walkUncached(a, b);
  // Only a real routed answer is worth keeping; a straight-line estimate
  // should be retried in case the key arrives later.
  if (fresh.source === "google") walkCache.set(k, fresh);
  return fresh;
}

async function walkUncached(a: LatLon, b: LatLon): Promise<Walk> {
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
  // A place we do not hold is an answer of "no", not a 500. Callers pass
  // building names from several places and one of them was still hardcoded to
  // Pittsburgh, which threw on .lat and took the whole request with it.
  if (!fromB || !toB) return undefined;
  // Stops are chosen from the data, not from a table.
  //
  // The hardcoded board/alight per building meant a new location needed a code
  // change, and "somewhere on campus" was not a question Orbit could answer.
  // bestStopPair resolves any two coordinates to the pair a single trip
  // actually serves in that order -- direction proved by the trip's own stop
  // sequence rather than asserted by a stop's name. The old table stays as a
  // fallback for the case where nothing is within walking distance.
  const originPt = opts.origin ?? fromB;
  const pair = bestStopPair(originPt, toB, c.ymd, Math.max(0, c.sec - 300));
  const boardId = pair?.boardId ?? (goingHome ? fromB.boardOutbound : BUILDINGS.Home.boardOutbound);
  const alightId = pair?.alightId ?? (goingHome ? BUILDINGS.Home.alightInbound : toB.alightInbound);
  if (!boardId || !alightId) return undefined;
  const bs = stopInfo(boardId), as = stopInfo(alightId);
  if (!bs || !as) return undefined;
  const origin = { ...(opts.origin ?? fromB), label: opts.origin ? "You" : opts.from };
  const boardStop = { id: bs.id, name: bs.name, lat: bs.lat, lon: bs.lon };
  const alightStop = { id: as.id, name: as.name, lat: as.lat, lon: as.lon };

  const [walkToStop, walkToDest] = await Promise.all([walk(origin, boardStop), walk(alightStop, toB)]);
  const feedValid = isFeedValid(c.ymd);
  // Whatever actually serves this pair today, rather than a fixed 61x list --
  // the hardcoded routes were right for Oakland to Squirrel Hill and wrong for
  // every other pair of points on campus.
  const usableRoutes = pair?.routes.length ? pair.routes : HOME_ROUTES;
  const sched = feedValid ? departuresAt(boardId, c.ymd, c.sec - 60, 90 * 60, usableRoutes) : [];
  const ride = rideMinutes(boardId, alightId, c.ymd, c.sec) ?? 12;
  // Realtime is per region, and getting this wrong is not cosmetic.
  //
  // The PRT feeds are Pittsburgh. Fetched while planning a New Jersey journey
  // they succeed, contain no matching trip ids, and the ghost rule -- feed is
  // up, trip should have started, no update for it -- then marks every single
  // Hudson County departure "not on the live feed". A green feed light and
  // every train struck through.
  //
  // NJ Transit's realtime sits behind a developer account we do not have, so
  // the light rail is timetable-only here and says so. PATH is live and is
  // reported separately, because its board publishes no trip ids and cannot
  // honestly be overlaid on a scheduled row.
  const prtLive = REGION === "oakland" && !c.simulated;
  const live = prtLive ? await realtimeIndex() : { index: new Map(), ok: false };
  const veh = prtLive ? await vehiclePositions() : { byTrip: new Map<string, VehiclePosition>(), ok: false };
  const alertFeed = prtLive ? await serviceAlerts(c.epoch) : { alerts: [] as ServiceAlert[], ok: false };

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
    // Ride time, per trip, from the feed where it has one.
    //
    // The feed predicts every stop on the trip -- six to twenty-nine of them --
    // and we were reading only the boarding stop and then applying one static
    // ride to every bus. So a 61C already twelve minutes down got the same
    // ride as an on-time 61D, and any delay picked up *during* the ride was
    // invisible. Using the predicted arrival at the alighting stop costs
    // nothing; the data is already in the response we fetched.
    const liveAlight = rt?.stops.get(alightId);
    const rawLiveRideSec = liveAlight ? d.sec + (liveAlight - schedEpoch) - departsSec : undefined;
    // Sanity-check the feed against the timetable before trusting it. A live
    // ride of six minutes where the schedule says thirteen is not a fast bus
    // on a fixed route through Oakland; it is a stale prediction or one made
    // mid-route. Accept between half and two and a half times the scheduled
    // ride and fall back to the timetable outside that, the same shape of
    // guard as the estimator's clamp: the feed can correct the schedule, it
    // cannot contradict it.
    const schedRideSec = ride * 60;
    const liveRideUsable = rawLiveRideSec !== undefined && rawLiveRideSec >= schedRideSec * 0.5 && rawLiveRideSec <= schedRideSec * 2.5;
    const alightSec = liveRideUsable ? departsSec + rawLiveRideSec! : departsSec + schedRideSec;
    const tripRideMinutes = Math.max(1, Math.round((alightSec - departsSec) / 60));
    const arriveSec = alightSec + walkToDest.minutes * 60;
    const margin = opts.arriveBySec === undefined ? 0 : Math.round((opts.arriveBySec - arriveSec) / 60);
    options.push({
      route: d.route,
      // Strip the route out of its own headsign. NJ Transit writes "HBLR 8TH
      // STREET" and we print the route beside it, so it read "HBLR hblr 8th
      // street".
      headsign: d.headsign.replace(new RegExp("^" + d.route.replace(/[.*+?^${}()|[]\]/g, "\      route: d.route, headsign: d.headsign, tripId: d.trip, dir: d.dir,") + "\s*", "i"), "").trim() || d.headsign,
      tripId: d.trip, dir: d.dir,
      departsSec, departsText: fmt(Math.floor(departsSec / 60)), scheduledText: fmt(Math.floor(d.sec / 60)), status, delaySec: liveEpoch ? liveEpoch - schedEpoch : undefined,
      vehicle, leaveBySec: departsSec - walkToStop.minutes * 60 - 120, leaveByText: fmt(Math.floor((departsSec - walkToStop.minutes * 60 - 120) / 60)),
      rideMinutes: tripRideMinutes, rideIsLive: liveRideUsable,
      confidence: confidenceOf({ status, vehicle, liveAlight: !!liveAlight, secondsAway: departsSec - c.sec }),
      alightSec, arriveSec, arriveText: fmt(Math.floor(arriveSec / 60)),
      // "you make it" against no deadline is a green badge meaning nothing.
      verdict: opts.arriveBySec === undefined ? null : { makesIt: arriveSec <= opts.arriveBySec, marginMin: margin },
      totalMinutes: Math.max(1, Math.round((arriveSec - (departsSec - walkToStop.minutes * 60 - 120)) / 60)),
      waitMinutes: Math.max(0, Math.round((departsSec - (c.sec + walkToStop.minutes * 60)) / 60)),
      shape,
    });
  }
  // A route PRT says is out of service is demoted, not deleted.
  //
  // Deleting it means a student's usual bus silently vanishes with no reason
  // given, and if the alert is wrong or stale they have lost a real option
  // they could see with their own eyes at the stop. Demoting keeps it visible,
  // keeps the reason attached, and makes sure it is never the one we
  // recommend -- which is the part that actually matters.
  const suspended = new Set(
    alertsFor(alertFeed.alerts, [...new Set(options.map((o) => o.route))], [boardId, alightId])
      .filter((a) => a.effect === "NO_SERVICE")
      .flatMap((a) => a.routes),
  );
  for (const o of options) if (suspended.has(o.route)) o.suspended = true;

  // PATH is the one live source we can read in Hudson County without an
  // account, so fetch it when the boarding station is a PATH one.
  let pathLive: Journey["pathLive"];
  if (REGION === "hudson" && !c.simulated) {
    const code = pathCodeForStopName(bs.name);
    if (code) {
      const feed = await pathDepartures();
      pathLive = { station: code, ok: feed.ok, departures: nextFrom(feed.departures, code).slice(0, 4) };
    }
  }

  // Live delays reorder buses; sort by when they actually leave, with anything
  // suspended pushed behind everything that is actually running.
  options.sort((a, b) => Number(a.suspended ?? false) - Number(b.suspended ?? false) || a.departsSec - b.departsSec);
  options.splice(4);

  return {
    clock: { ...c, text: fmt(Math.floor(c.sec / 60)) },
    origin,
    destination: { ...toB, label: opts.to, arriveBySec: opts.arriveBySec, arriveByText: opts.arriveBySec === undefined ? undefined : fmt(Math.floor(opts.arriveBySec / 60)) },
    boardStop, alightStop, walkToStop, walkToDest, options,
    realtime: { tripsOk: live.ok, vehiclesOk: veh.ok, alertsOk: alertFeed.ok },
    feedValid,
    alerts: alertsFor(alertFeed.alerts, [...new Set(options.map((o) => o.route))], [boardId, alightId]),
    noDirectRoute: !pair && options.length === 0,
    pathLive,
  };
}
