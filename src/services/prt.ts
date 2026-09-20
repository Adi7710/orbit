import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { BusArrival } from "@/core/bus";
import { departuresAt, isFeedValid, ymd, type Departure } from "./schedule";
import { tzOffsetMinutes } from "@/core/ics";

/**
 * Pittsburgh Regional Transit: static schedule (data/prt-oakland.json) with
 * the public GTFS-realtime trip-update feed overlaid. Both are published by
 * PRT under its Developer License Agreement; we use them for a non-commercial
 * hackathon demo.
 *
 * Realtime feed: https://truetime.portauthority.org/gtfsrt-bus/trips
 * (protobuf, no key, refreshed continuously).
 *
 * A "ghost" is a scheduled trip that should already be on the road (its first
 * stop departed more than GHOST_GRACE_SEC ago) but has no trip update in the
 * feed. A trip that has not started yet is simply "scheduled", not a ghost.
 */
const RT_URL = process.env.PRT_GTFS_RT_URL ?? "https://truetime.portauthority.org/gtfsrt-bus/trips";
const GHOST_GRACE_SEC = 180;
const RT_TTL_MS = 30_000;

export interface Clock { ymd: string; sec: number; epoch: number; simulated: boolean }

/**
 * The clock the app plans against. DEMO_CLOCK="2026-09-22T13:10" pins it to a
 * weekday so a Sunday judging slot still shows a weekday timetable. Otherwise
 * it is now, in Pittsburgh time.
 */
export function clock(now = new Date()): Clock {
  const pin = process.env.DEMO_CLOCK;
  if (pin) {
    const [date, time] = pin.split("T");
    const [h, m] = (time ?? "12:00").split(":").map(Number);
    // Not a hardcoded -04:00. That is EDT, and on 2 November 2026 Pittsburgh
    // goes to EST, at which point every pinned demo time is an hour out.
    const wall = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
    const epoch = (wall.getTime() - tzOffsetMinutes(wall, "America/New_York") * 60000) / 1000;
    return { ymd: date.replace(/-/g, ""), sec: h * 3600 + m * 60, epoch, simulated: true };
  }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { ymd: ymd(now), sec: (get("hour") % 24) * 3600 + get("minute") * 60 + get("second"), epoch: Math.floor(now.getTime() / 1000), simulated: false };
}

type RtIndex = Map<string, { stops: Map<string, number>; vehicle?: string; delay?: number }>; // tripId -> stopId -> arrival epoch
let rtCache: { at: number; index: RtIndex; ok: boolean } | undefined;

export async function realtimeIndex(): Promise<{ index: RtIndex; ok: boolean; ageSec: number }> {
  if (rtCache && Date.now() - rtCache.at < RT_TTL_MS) return { index: rtCache.index, ok: rtCache.ok, ageSec: (Date.now() - rtCache.at) / 1000 };
  const index: RtIndex = new Map();
  let ok = false;
  if (process.env.DEMO_MODE !== "offline") {
    try {
      const res = await fetch(RT_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
        for (const e of feed.entity) {
          const tu = e.tripUpdate;
          if (!tu?.trip?.tripId) continue;
          const stops = new Map<string, number>();
          for (const stu of tu.stopTimeUpdate ?? []) {
            const t = Number(stu.arrival?.time ?? stu.departure?.time ?? 0);
            if (stu.stopId && t) stops.set(stu.stopId, t);
          }
          index.set(tu.trip.tripId, { stops, vehicle: tu.vehicle?.id ?? undefined, delay: tu.delay ?? undefined });
        }
        ok = true;
      }
    } catch {
      ok = false;
    }
  }
  rtCache = { at: Date.now(), index, ok };
  return { index, ok, ageSec: 0 };
}

export interface ArrivalDetail extends BusArrival { headsign: string; scheduledMinutes: number; delaySec?: number; status: "live" | "scheduled" | "ghost"; tripId: string }

/**
 * Upcoming departures at a stop: schedule first, realtime overlaid where the
 * trip reports this stop. Times are minutes from midnight in Pittsburgh time.
 */
export async function upcomingArrivals(stopId: string, opts: { routes?: string[]; windowMin?: number; now?: Clock } = {}): Promise<{ arrivals: ArrivalDetail[]; realtimeOk: boolean; clock: Clock; feedValid: boolean }> {
  const c = opts.now ?? clock();
  const windowSec = (opts.windowMin ?? 60) * 60;
  const feedValid = isFeedValid(c.ymd);
  const sched: Departure[] = feedValid ? departuresAt(stopId, c.ymd, c.sec - 120, windowSec + 120, opts.routes) : [];
  const { index, ok } = c.simulated ? { index: new Map() as RtIndex, ok: false } : await realtimeIndex();

  const arrivals: ArrivalDetail[] = sched.map((d) => {
    const rt = index.get(d.trip);
    const liveEpoch = rt?.stops.get(stopId);
    const scheduledMinutes = Math.round(d.sec / 60);
    if (liveEpoch) {
      const liveSec = d.sec + (liveEpoch - (c.epoch - c.sec + d.sec)); // shift by (live - scheduled) epoch difference
      return { route: d.route, stopId, arrivalMinutes: Math.round(liveSec / 60), realtime: true, vehicleId: rt?.vehicle, headsign: d.headsign, scheduledMinutes, delaySec: liveEpoch - (c.epoch - c.sec + d.sec), status: "live", tripId: d.trip };
    }
    const started = d.tripStart + GHOST_GRACE_SEC < c.sec;
    const ghost = ok && started && !rt;
    return { route: d.route, stopId, arrivalMinutes: scheduledMinutes, realtime: false, headsign: d.headsign, scheduledMinutes, status: ghost ? "ghost" : "scheduled", tripId: d.trip };
  });

  return { arrivals: arrivals.filter((a) => a.arrivalMinutes >= Math.floor(c.sec / 60) - 1).sort((a, b) => a.arrivalMinutes - b.arrivalMinutes), realtimeOk: ok, clock: c, feedValid };
}
