import { NextResponse } from "next/server";
import { buildJourney, BUILDINGS } from "@/lib/journey";
import { routeColor } from "@/services/schedule";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/transit/journey?from=Cathedral&to=Home
 * GET /api/transit/journey?from=Home&to=Cathedral&arriveBy=14:30&lat=40.4372&lon=-79.9230
 *
 * from/to are building keys (Cathedral, Hillman, Posvar, Sennott, Benedum, Home).
 * lat/lon override the origin with the phone's location. arriveBy defaults to the
 * next class start when going to campus.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const from = (u.searchParams.get("from") ?? "Cathedral") as keyof typeof BUILDINGS;
  const to = (u.searchParams.get("to") ?? "Home") as keyof typeof BUILDINGS;
  if (!(from in BUILDINGS) || !(to in BUILDINGS)) return NextResponse.json({ error: `unknown place; use ${Object.keys(BUILDINGS).join(", ")}` }, { status: 400 });
  const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
  const origin = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? { lat, lon } : undefined;

  let arriveBySec: number | undefined;
  const ab = u.searchParams.get("arriveBy");
  if (ab) { const [h, m] = ab.split(":").map(Number); arriveBySec = h * 3600 + (m || 0) * 60; }
  else if (to !== "Home") {
    const next = store().blocks.filter((b) => b.place === to).sort((a, b) => a.start - b.start)[0];
    if (next) arriveBySec = next.start * 60;
  }

  const j = await buildJourney({ origin, from, to, arriveBySec });
  if (!j) return NextResponse.json({ error: "no bus leg between those places" }, { status: 404 });
  return NextResponse.json({ ...j, routeColors: Object.fromEntries(j.options.map((o) => [o.route, routeColor(o.route)])) });
}
