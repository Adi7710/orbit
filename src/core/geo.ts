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
