/**
 * Static PRT schedule for the Oakland / Squirrel Hill slice, extracted by
 * scripts/gtfs-extract.mjs into data/prt-oakland.json. Pure functions: which
 * service ids run on a date, and which departures leave a stop after a time.
 */
import oakland from "../../data/prt-oakland.json";
import hudson from "../../data/njt-hudson.json";

/**
 * Which city Orbit is planning in.
 *
 * ORBIT_REGION=hudson  Jersey City / Hoboken: Hudson-Bergen Light Rail and
 *                      PATH, for a Stevens student. This is the default.
 * ORBIT_REGION=oakland Pittsburgh: PRT around Pitt. Kept whole, because the
 *                      Oakland slice is what every transit test is pinned to
 *                      and throwing it away to move cities would have cost the
 *                      only regression suite this layer has.
 *
 * Both slices share one schema, so nothing downstream knows the difference.
 */
export const REGION = (process.env.ORBIT_REGION ?? "hudson") as "hudson" | "oakland";
const schedule = REGION === "oakland" ? oakland : hudson;

export interface Departure { stop: string; trip: string; route: string; dir: number; headsign: string; service: string; sec: number; seq: number; tripStart: number }
interface Calendar { id: string; days: boolean[]; start: string; end: string }
interface CalendarDate { id: string; date: string; type: number }
interface Schedule {
  feed: { feed_start_date: string; feed_end_date: string; feed_version: string };
  calendar: Calendar[];
  calendarDates: CalendarDate[];
  stops: Record<string, { id: string; name: string; lat: number; lon: number; role: string; area: string }>;
  routes: { id: string; short: string; long: string; color: string }[];
  shapes?: Record<string, [number, number][]>;
  departures: Departure[];
}

/** Canonical polyline for a route and direction (61/71 family), [lat, lon] pairs, or [] if not extracted. */
export function routeShape(route: string, dir: number): [number, number][] {
  return data.shapes?.[`${route}|${dir}`] ?? [];
}

export function routeColor(route: string): string | undefined {
  return data.routes.find((r) => r.short === route)?.color;
}

const data = schedule as unknown as Schedule;

/**
 * Indexes, built once.
 *
 * Every lookup here used to be a linear scan of the whole departures array.
 * That was tolerable on the Pittsburgh slice and is not on Hudson County:
 * 54,608 departures, and bestStopPair tries up to thirty-six stop pairs per
 * request, each one scanning the lot. Two million comparisons to answer "when
 * is the next train", which measured at 1.5 seconds a request.
 *
 * Both maps are derived from the same immutable JSON, so they are built once
 * at module load and never invalidated.
 */
const byStop = new Map<string, Departure[]>();
const byTrip = new Map<string, Departure[]>();
for (const d of data.departures) {
  let a = byStop.get(d.stop);
  if (!a) byStop.set(d.stop, (a = []));
  a.push(d);
  let t = byTrip.get(d.trip);
  if (!t) byTrip.set(d.trip, (t = []));
  t.push(d);
}
// Sorted once so callers never have to.
for (const a of byStop.values()) a.sort((x, y) => x.sec - y.sec);
for (const t of byTrip.values()) t.sort((x, y) => x.seq - y.seq);

/** Does this trip call at `stop` after sequence `afterSeq`? */
const tripReaches = (trip: string, stop: string, afterSeq: number) =>
  (byTrip.get(trip) ?? []).some((d) => d.stop === stop && d.seq > afterSeq);

/**
 * Does this specific trip get you from one stop to the other?
 *
 * The route is not enough. A route runs in both directions, and a stop's
 * departure board lists every trip calling there, so filtering by route alone
 * offers a train going the wrong way. That is exactly what Orbit was doing:
 * boarding the light rail at Marin Boulevard on a service terminating at
 * Jersey Avenue, one stop further south, and presenting it as the way to
 * Hoboken.
 */
export function tripServes(tripId: string, boardId: string, alightId: string): boolean {
  const legs = byTrip.get(tripId) ?? [];
  const board = legs.find((d) => d.stop === boardId);
  return !!board && tripReaches(tripId, alightId, board.seq);
}

export const STOP = {
  campusOutbound: "31", // Forbes Ave + Bigelow Blvd (Cathedral / Hillman), eastbound
  campusOutboundSennott: "20959", // Forbes Ave + Bouquet St FS
  campusInbound: "34", // Fifth Ave + University Pl (Cathedral), westbound
  campusInboundBenedum: "35", // Fifth Ave + Thackeray Ave
  homeInbound: "7095", // Forbes Ave + Shady (Squirrel Hill), 61A/61B toward Oakland
  homeOutbound: "7126", // Forbes Ave + Murray Ave (Squirrel Hill), 61A/B/C/D alight
} as const;

export function stopInfo(id: string) {
  return data.stops[id];
}

export function feedInfo() {
  return data.feed;
}

/** yyyymmdd for a Date in a timezone. */
export function ymd(d: Date, tz = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "");
}

function weekdayIndex(yyyymmdd: string): number {
  // 0 = monday ... 6 = sunday, computed on a UTC noon date to avoid DST edges.
  const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  const js = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 = sunday
  return (js + 6) % 7;
}

/** Service ids active on a calendar date, honoring calendar_dates exceptions (1 = added, 2 = removed). */
export function activeServices(yyyymmdd: string): Set<string> {
  const wd = weekdayIndex(yyyymmdd);
  const active = new Set<string>();
  for (const c of data.calendar) {
    if (yyyymmdd >= c.start && yyyymmdd <= c.end && c.days[wd]) active.add(c.id);
  }
  for (const e of data.calendarDates) {
    if (e.date !== yyyymmdd) continue;
    if (e.type === 1) active.add(e.id);
    if (e.type === 2) active.delete(e.id);
  }
  return active;
}

/** Departures from a stop on a date, from `fromSec` (seconds after midnight, may exceed 86400) for `windowSec`. */
export function departuresAt(stopId: string, yyyymmdd: string, fromSec: number, windowSec = 3600, routes?: string[]): Departure[] {
  const services = activeServices(yyyymmdd);
  const routeSet = routes ? new Set(routes) : undefined;
  // Indexed by stop and pre-sorted by time, so this is a filter over one
  // stop's departures rather than over all fifty-four thousand.
  return (byStop.get(stopId) ?? []).filter(
    (d) => services.has(d.service) && d.sec >= fromSec && d.sec <= fromSec + windowSec && (!routeSet || routeSet.has(d.route)),
  );
}

/** Scheduled ride time between two stops on the same trip, if the trip serves both. */
export function rideMinutes(fromStop: string, toStop: string, yyyymmdd: string, fromSec: number): number | undefined {
  const services = activeServices(yyyymmdd);
  const from = data.departures.filter((d) => d.stop === fromStop && services.has(d.service) && d.sec >= fromSec).sort((a, b) => a.sec - b.sec);
  for (const f of from.slice(0, 20)) {
    const to = data.departures.find((d) => d.trip === f.trip && d.stop === toStop && d.seq > f.seq);
    if (to) return Math.round((to.sec - f.sec) / 60);
  }
  return undefined;
}

export function isFeedValid(yyyymmdd: string): boolean {
  return yyyymmdd >= data.feed.feed_start_date && yyyymmdd <= data.feed.feed_end_date;
}

// MARK: - Choosing the stops

/** Metres between two points. Local copy so this module stays free of core imports. */
function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface StopPair { boardId: string; alightId: string; routes: string[]; walkFrom: number; walkTo: number }

/** Every stop within `radius` metres, nearest first. */
export function stopsNear(p: { lat: number; lon: number }, radius = 1200): { id: string; metres: number }[] {
  return Object.values(data.stops)
    .map((s) => ({ id: s.id, metres: Math.round(metres(p, s)) }))
    .filter((s) => s.metres <= radius)
    .sort((a, b) => a.metres - b.metres);
}

/**
 * Which routes actually run from one stop to another, in that order, today.
 *
 * Direction is proved by the trip's own stop sequence rather than asserted by
 * a name. A stop labelled "outbound" is only outbound relative to somewhere,
 * and the pair that matters is the one a single trip serves board-then-alight.
 */
export function routesBetween(boardId: string, alightId: string, yyyymmdd: string, fromSec = 0, windowSec = 24 * 3600): string[] {
  if (boardId === alightId) return [];
  const services = activeServices(yyyymmdd);
  const boards = (byStop.get(boardId) ?? []).filter((d) => services.has(d.service) && d.sec >= fromSec && d.sec <= fromSec + windowSec);
  const out = new Set<string>();
  for (const b of boards) {
    // One route is enough to prove the pair; no need to walk every trip on it.
    if (out.has(b.route)) continue;
    if (tripReaches(b.trip, alightId, b.seq)) out.add(b.route);
  }
  return [...out];
}

/**
 * Pick where to get on and off for an arbitrary pair of points.
 *
 * This replaces a hardcoded board/alight per building, which meant a new
 * location needed a code change and "somewhere on campus" was not a question
 * Orbit could answer at all. Now any two coordinates resolve to the stop pair
 * that is actually served, scored on the thing a student cares about: total
 * time on foot at both ends.
 *
 * Walking is weighted over waiting because a stop two hundred metres further
 * away that is served by four routes beats one served by a single hourly bus,
 * and route count is the cheap proxy for that.
 */
export function bestStopPair(
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number },
  yyyymmdd: string,
  fromSec = 0,
  opts: { radius?: number; windowSec?: number } = {},
): StopPair | undefined {
  const radius = opts.radius ?? 1200;
  // The whole service day by default. "Is this pair served at all today" is a
  // different question from "is there one in the next three hours", and the
  // narrow default silently answered the second while being asked the first --
  // with fromSec 0 that is midnight to three in the morning, which is empty
  // for every pair on the network.
  const window = opts.windowSec ?? 24 * 3600;
  const boards = stopsNear(origin, radius).slice(0, 6);
  const alights = stopsNear(dest, radius).slice(0, 6);
  if (!boards.length || !alights.length) return undefined;

  let best: (StopPair & { score: number }) | undefined;
  for (const b of boards) {
    for (const a of alights) {
      if (a.id === b.id) continue;
      const routes = routesBetween(b.id, a.id, yyyymmdd, fromSec, window);
      if (!routes.length) continue;
      // Walking metres at both ends, less a bonus for every extra route that
      // serves the pair: more routes means a shorter wait, on average.
      const score = b.metres + a.metres - Math.min(routes.length, 4) * 150;
      if (!best || score < best.score) best = { boardId: b.id, alightId: a.id, routes, walkFrom: b.metres, walkTo: a.metres, score };
    }
  }
  return best ? { boardId: best.boardId, alightId: best.alightId, routes: best.routes, walkFrom: best.walkFrom, walkTo: best.walkTo } : undefined;
}

/**
 * The stops a trip calls at between boarding and alighting.
 *
 * A map that shows only where you get on and off hides the thing people
 * actually use to orient themselves mid-journey: which stop is next, and how
 * many are left. This reads the trip's own sequence, so it is the real calling
 * pattern rather than every stop the route passes.
 */
export function callingPoints(tripId: string, boardId: string, alightId: string): { id: string; name: string; lat: number; lon: number; sec: number }[] {
  const legs = byTrip.get(tripId) ?? [];
  const board = legs.find((d) => d.stop === boardId);
  const alight = legs.find((d) => d.stop === alightId && (!board || d.seq > board.seq));
  if (!board || !alight) return [];
  return legs
    .filter((d) => d.seq >= board.seq && d.seq <= alight.seq)
    .map((d) => {
      const s = data.stops[d.stop];
      return s ? { id: s.id, name: s.name, lat: s.lat, lon: s.lon, sec: d.sec } : undefined;
    })
    .filter((x): x is { id: string; name: string; lat: number; lon: number; sec: number } => !!x);
}
