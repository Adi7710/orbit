/** Small geo helpers, pure. */
export type LatLon = { lat: number; lon: number };

const R = 6371000;
export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Street distance is longer than the crow flies; 1.3 is the usual urban detour factor. Walking 80 m/min. */
export const WALK_DETOUR = 1.3;
export const WALK_M_PER_MIN = 80;
export function walkMinutes(a: LatLon, b: LatLon): number {
  return Math.max(1, Math.round((haversineMeters(a, b) * WALK_DETOUR) / WALK_M_PER_MIN));
}

/** Google encoded polyline decoder (also what MapKit/Apple can consume after decoding). */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (const which of [0, 1] as const) {
      let shift = 0, result = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

/** Index of the polyline vertex nearest to a point, for trimming a route shape between two stops. */
export function nearestIndex(line: [number, number][], p: LatLon): number {
  let best = 0, bestD = Infinity;
  line.forEach(([lat, lon], i) => { const d = haversineMeters({ lat, lon }, p); if (d < bestD) { bestD = d; best = i; } });
  return best;
}

/** Distance along a polyline from vertex i to vertex j (i <= j). */
export function pathMeters(line: [number, number][], i: number, j: number): number {
  let m = 0;
  for (let k = i; k < j; k++) m += haversineMeters({ lat: line[k][0], lon: line[k][1] }, { lat: line[k + 1][0], lon: line[k + 1][1] });
  return m;
}

/** Compass bearing from a to b, degrees clockwise from north. */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/**
 * Where a vehicle would be if it ran exactly to its timetable: along the
 * shape between the boarding and alighting stops while the ride is under
 * way, or approaching the boarding stop before departure. For the demo in
 * New Jersey, where no vehicle positions are published without a developer
 * key, so the map can still show the train. The caller labels it scheduled;
 * it is never a fix and never feeds confidence.
 */
export function scheduledPosition(
  shape: [number, number][],
  departsSec: number,
  alightSec: number,
  nowSec: number,
  approachMetersPerSec = 12,
): { lat: number; lon: number; bearing: number; progress: number } | undefined {
  if (shape.length < 2) return undefined;
  const first = shape[0], second = shape[1];

  if (nowSec < departsSec) {
    // Approaching: back along the first segment at a light-rail pace, capped.
    const back = Math.min(1500, (departsSec - nowSec) * approachMetersPerSec);
    const brg = bearingDeg(first, second);
    const rad = ((brg + 180) % 360) * (Math.PI / 180);
    const lat = first[0] + (Math.cos(rad) * back) / 111320;
    const lon = first[1] + (Math.sin(rad) * back) / (111320 * Math.cos((first[0] * Math.PI) / 180));
    return { lat, lon, bearing: brg, progress: 0 };
  }

  const span = Math.max(1, alightSec - departsSec);
  const t = Math.min(1, (nowSec - departsSec) / span);
  const total = pathMeters(shape, 0, shape.length - 1) || 1;
  const segLen = (k: number) => haversineMeters({ lat: shape[k][0], lon: shape[k][1] }, { lat: shape[k + 1][0], lon: shape[k + 1][1] });
  let target = t * total, i = 0;
  while (i < shape.length - 2 && target > segLen(i)) { target -= segLen(i); i++; }
  const f = Math.min(1, target / (segLen(i) || 1));
  return {
    lat: shape[i][0] + (shape[i + 1][0] - shape[i][0]) * f,
    lon: shape[i][1] + (shape[i + 1][1] - shape[i][1]) * f,
    bearing: bearingDeg(shape[i], shape[i + 1]),
    progress: t,
  };
}
