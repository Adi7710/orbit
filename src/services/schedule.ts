/**
 * Static PRT schedule for the Oakland / Squirrel Hill slice, extracted by
 * scripts/gtfs-extract.mjs into data/prt-oakland.json. Pure functions: which
 * service ids run on a date, and which departures leave a stop after a time.
 */
import schedule from "../../data/prt-oakland.json";

export interface Departure { stop: string; trip: string; route: string; dir: number; headsign: string; service: string; sec: number; seq: number; tripStart: number }
interface Calendar { id: string; days: boolean[]; start: string; end: string }
interface CalendarDate { id: string; date: string; type: number }
interface Schedule {
  feed: { feed_start_date: string; feed_end_date: string; feed_version: string };
  calendar: Calendar[];
  calendarDates: CalendarDate[];
  stops: Record<string, { id: string; name: string; lat: number; lon: number; role: string; area: string }>;
  routes: { id: string; short: string; long: string; color: string }[];
  departures: Departure[];
}

const data = schedule as unknown as Schedule;

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
  return data.departures
    .filter((d) => d.stop === stopId && services.has(d.service) && d.sec >= fromSec && d.sec <= fromSec + windowSec && (!routes || routes.includes(d.route)))
    .sort((a, b) => a.sec - b.sec);
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
