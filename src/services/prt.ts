import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { BusArrival } from "@/core/bus";
import { fromDate } from "@/core/time";

/**
 * Pittsburgh Regional Transit realtime. Requires accepting PRT's Developer
 * License Agreement. In DEMO_MODE we serve a recorded snapshot so the demo
 * never depends on a bus actually existing.
 */
export async function upcomingArrivals(stopIds: string[], routes?: string[]): Promise<BusArrival[]> {
  if (process.env.DEMO_MODE === "true" || !process.env.PRT_GTFS_RT_URL) return demoArrivals(stopIds);
  const res = await fetch(process.env.PRT_GTFS_RT_URL, { cache: "no-store" });
  if (!res.ok) return demoArrivals(stopIds);
  const buf = new Uint8Array(await res.arrayBuffer());
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
  const out: BusArrival[] = [];
  for (const e of feed.entity) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    const route = tu.trip?.routeId ?? "";
    if (routes && !routes.includes(route)) continue;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (!stu.stopId || !stopIds.includes(stu.stopId)) continue;
      const ts = Number(stu.arrival?.time ?? stu.departure?.time ?? 0);
      if (!ts) continue;
      out.push({ route, stopId: stu.stopId, arrivalMinutes: fromDate(new Date(ts * 1000), "America/New_York"), realtime: true, vehicleId: tu.vehicle?.id ?? undefined });
    }
  }
  return out.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes);
}

function demoArrivals(stopIds: string[]): BusArrival[] {
  const now = fromDate(new Date(), "America/New_York");
  const stop = stopIds[0] ?? "forbes-bigelow";
  return [
    { route: "61C", stopId: stop, arrivalMinutes: now + 4, realtime: false }, // ghost: scheduled, no vehicle
    { route: "71B", stopId: stop, arrivalMinutes: now + 7, realtime: true, vehicleId: "3310" },
    { route: "61D", stopId: stop, arrivalMinutes: now + 15, realtime: true, vehicleId: "3402" },
  ];
}
