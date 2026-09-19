import GtfsRealtimeBindings from "gtfs-realtime-bindings";

/**
 * Live bus positions from PRT's public GTFS-realtime vehicle feed. About two
 * thirds of vehicles report the trip they are on, which is what lets the map
 * show the exact bus for a departure. Cached 15 seconds.
 */
const URL = process.env.PRT_GTFS_RT_VEHICLES_URL ?? "https://truetime.portauthority.org/gtfsrt-bus/vehicles";
const TTL_MS = 15_000;

export interface VehiclePosition { vehicleId: string; tripId?: string; routeId?: string; lat: number; lon: number; bearing?: number; speedMps?: number; timestamp: number }

let cache: { at: number; byTrip: Map<string, VehiclePosition>; byVehicle: Map<string, VehiclePosition>; ok: boolean } | undefined;

export async function vehiclePositions(): Promise<{ byTrip: Map<string, VehiclePosition>; byVehicle: Map<string, VehiclePosition>; ok: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const byTrip = new Map<string, VehiclePosition>();
  const byVehicle = new Map<string, VehiclePosition>();
  let ok = false;
  if (process.env.DEMO_MODE !== "offline") {
    try {
      const res = await fetch(URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
        for (const e of feed.entity) {
          const v = e.vehicle;
          if (!v?.position) continue;
          const p: VehiclePosition = {
            vehicleId: v.vehicle?.id ?? e.id,
            tripId: v.trip?.tripId ?? undefined,
            routeId: v.trip?.routeId ?? undefined,
            lat: v.position.latitude,
            lon: v.position.longitude,
            bearing: v.position.bearing ?? undefined,
            speedMps: v.position.speed ?? undefined,
            timestamp: Number(v.timestamp ?? 0),
          };
          byVehicle.set(p.vehicleId, p);
          if (p.tripId) byTrip.set(p.tripId, p);
        }
        ok = true;
      }
    } catch {
      ok = false;
    }
  }
  cache = { at: Date.now(), byTrip, byVehicle, ok };
  return cache;
}
