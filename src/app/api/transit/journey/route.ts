import { NextResponse } from "next/server";
import { buildJourney, BUILDINGS } from "@/lib/journey";
import { routeColor } from "@/services/schedule";
import { store } from "@/lib/store";
import { clock } from "@/services/prt";

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
  // Defaults come from the region's own place list, never from Pittsburgh
  // building names. An absent or empty value means "you pick": the map sends
  // exactly that on its first render, before the places list has loaded, and
  // answering it with a 400 painted "unknown place" across the screen.
  const names = Object.keys(BUILDINGS);
  const raw = (k: string) => (u.searchParams.get(k) ?? "").trim();
  const from = (raw("from") || "Home") as keyof typeof BUILDINGS;
  const to = (raw("to") || names.find((n) => n !== from) || names[0]) as keyof typeof BUILDINGS;
  if (!(from in BUILDINGS) || !(to in BUILDINGS)) {
    return NextResponse.json({ error: `unknown place; use ${names.join(", ")}` }, { status: 400 });
  }
  const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
  const origin = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? { lat, lon } : undefined;

  let arriveBySec: number | undefined;
  const ab = u.searchParams.get("arriveBy");
  if (ab) { const [h, m] = ab.split(":").map(Number); arriveBySec = h * 3600 + (m || 0) * 60; }
  else if (to !== "Home") {
    const next = store().blocks.filter((b) => b.place === to).sort((a, b) => a.start - b.start)[0];
    if (next) arriveBySec = next.start * 60;
  }

  // Drop a deadline that has already gone. The map keeps arriveBy in the URL,
  // so at nine at night it was still measuring against a half past three class
  // and reporting "you miss it by 361 min" -- arithmetically true, and useless.
  const nowSec = clock().sec;
  if (arriveBySec !== undefined && arriveBySec <= nowSec) arriveBySec = undefined;

  const j = await buildJourney({ origin, from, to, arriveBySec });
  if (!j) return NextResponse.json({ error: "no bus leg between those places" }, { status: 404 });
  return NextResponse.json(
    { ...j, routeColors: Object.fromEntries(j.options.map((o) => [o.route, routeColor(o.route)])) },
    {
      headers: {
        // Private: this is one student's journey, never a shared CDN object.
        // Ten seconds is under the client's own poll interval and under every
        // upstream feed's TTL, so it collapses a burst of refreshes -- a
        // double-tap, two tabs, a reconnect -- without ever showing a stale bus.
        "Cache-Control": "private, max-age=10",
      },
    },
  );
}
