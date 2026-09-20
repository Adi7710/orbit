#!/usr/bin/env node
/**
 * Extract the Jersey City / Hoboken slice into data/njt-hudson.json, in the
 * same schema scripts/gtfs-extract.mjs produces for Pittsburgh, so nothing
 * downstream has to know which city it is looking at.
 *
 *   node scripts/gtfs-extract-hudson.mjs
 *
 * Two agencies, because the commute genuinely uses both:
 *
 *  - **Hudson-Bergen Light Rail**, inside NJ Transit's rail GTFS. The spine of
 *    Jersey City: Exchange Place, Harborside, Newport, Essex Street, Marin
 *    Boulevard, Jersey Avenue and Hoboken Terminal are all on one line.
 *  - **PATH**, which is the fast way from Grove Street, Newport, Exchange
 *    Place or Journal Square into Hoboken, and the only one of the two with a
 *    realtime feed we can read without an account.
 *
 * Both static feeds are public and need no key:
 *   https://www.njtransit.com/rail_data.zip
 *   https://data.trilliumtransit.com/gtfs/path-nj-us/path-nj-us.zip
 *
 * Stevens sits on Castle Point, up the hill from Hoboken Terminal, so the last
 * leg of almost every journey is a walk the app already measures.
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const OUT = path.join(process.cwd(), "data", "njt-hudson.json");
const SOURCES = [
  { agency: "NJT", url: "https://www.njtransit.com/rail_data.zip", routes: new Set(["HBLR"]) },
  // Only the PATH routes that reach Hoboken. Newark-WTC and the Harrison
  // shuttle never do, and they were two thirds of the extract.
  { agency: "PATH", url: "https://data.trilliumtransit.com/gtfs/path-nj-us/path-nj-us.zip", hoboken: true },
];

/** Everything within reach of Jersey City or Stevens. Matched on name, since ids differ per agency. */
const KEEP_STOP = /hoboken|exchange place|harborside|newport|essex street|marin b|jersey ave|grove street|journal square|pavonia|christopher columbus|9th street|2nd street|city hall/i;

// ---- tiny CSV reader that handles quoted fields ----------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const secs = (hhmmss) => {
  const [h, m, s] = String(hhmmss).split(":").map(Number);
  return Number.isFinite(h) ? h * 3600 + m * 60 + (s || 0) : undefined; // may exceed 86400 after midnight
};

async function load(url) {
  console.log(`  downloading ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return new AdmZip(Buffer.from(await res.arrayBuffer()));
}

const readTable = (zip, name) => {
  const e = zip.getEntry(name);
  return e ? parseCsv(e.getData().toString("utf8")) : [];
};

async function main() {
  const stops = {};
  const routes = [];
  const departures = [];
  const calendar = [];
  const calendarDates = [];
  const shapes = {};
  let feed = { feed_start_date: "20000101", feed_end_date: "20991231", feed_version: "hudson" };

  for (const src of SOURCES) {
    console.log(`\n${src.agency}:`);
    const zip = await load(src.url);

    const routeRows = readTable(zip, "routes.txt").filter((r) =>
      src.hoboken ? /hoboken/i.test(r.route_long_name || "") : !src.routes || src.routes.has(r.route_short_name) || src.routes.has(r.route_id));
    const routeById = new Map(routeRows.map((r) => [r.route_id, r]));
    // PATH names every route "PATH"; the long name is what a person says.
    for (const r of routeRows) {
      const short = src.agency === "PATH" ? r.route_long_name.replace(/\s*\(via Hoboken\)/i, "").trim() : r.route_short_name || r.route_id;
      if (!routes.some((x) => x.id === r.route_id)) routes.push({ id: r.route_id, short, long: r.route_long_name || short, color: (r.route_color || "").replace("#", "") || (src.agency === "PATH" ? "2E3192" : "0078C6"), agency: src.agency });
    }
    console.log(`  routes kept: ${routeRows.length}`);

    const keptStops = new Set();
    for (const s of readTable(zip, "stops.txt")) {
      if (!KEEP_STOP.test(s.stop_name)) continue;
      const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const id = `${src.agency}:${s.stop_id}`;
      stops[id] = { id, name: s.stop_name.toUpperCase(), lat, lon, role: /hoboken/i.test(s.stop_name) ? "hoboken" : "jersey-city", area: src.agency, agency: src.agency };
      keptStops.add(s.stop_id);
    }
    console.log(`  stops kept: ${keptStops.size}`);

    const trips = readTable(zip, "trips.txt").filter((t) => routeById.has(t.route_id));
    const tripById = new Map(trips.map((t) => [t.trip_id, t]));
    console.log(`  trips: ${trips.length}`);

    // Services. NJT rail ships calendar_dates only; PATH ships both.
    for (const c of readTable(zip, "calendar.txt")) {
      calendar.push({
        id: `${src.agency}:${c.service_id}`,
        days: [c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday].map((x) => x === "1"),
        start: c.start_date, end: c.end_date,
      });
    }
    for (const d of readTable(zip, "calendar_dates.txt")) {
      calendarDates.push({ id: `${src.agency}:${d.service_id}`, date: d.date, type: Number(d.exception_type) });
    }

    // Stop times, restricted to the trips and stops we kept.
    const times = readTable(zip, "stop_times.txt").filter((st) => tripById.has(st.trip_id) && keptStops.has(st.stop_id));
    const firstSecByTrip = new Map();
    for (const st of times) {
      const s = secs(st.departure_time || st.arrival_time);
      if (s === undefined) continue;
      const prev = firstSecByTrip.get(st.trip_id);
      if (prev === undefined || s < prev) firstSecByTrip.set(st.trip_id, s);
    }
    for (const st of times) {
      const t = tripById.get(st.trip_id);
      const r = routeById.get(t.route_id);
      const sec = secs(st.departure_time || st.arrival_time);
      if (sec === undefined) continue;
      departures.push({
        stop: `${src.agency}:${st.stop_id}`,
        trip: `${src.agency}:${st.trip_id}`,
        route: src.agency === "PATH" ? (r.route_long_name || "PATH").replace(/\s*\(via Hoboken\)/i, "").trim() : r.route_short_name || r.route_id,
        dir: Number(t.direction_id || 0),
        headsign: (t.trip_headsign || r.route_long_name || "").toUpperCase(),
        service: `${src.agency}:${t.service_id}`,
        sec,
        seq: Number(st.stop_sequence),
        tripStart: firstSecByTrip.get(st.trip_id) ?? sec,
      });
    }
    console.log(`  departures: ${times.length}`);

    // One representative shape per route and direction, for drawing the line.
    const shapeRows = readTable(zip, "shapes.txt");
    if (shapeRows.length) {
      const byShape = new Map();
      for (const p of shapeRows) {
        if (!byShape.has(p.shape_id)) byShape.set(p.shape_id, []);
        byShape.get(p.shape_id).push([Number(p.shape_pt_lat), Number(p.shape_pt_lon), Number(p.shape_pt_sequence)]);
      }
      for (const t of trips) {
        const r = routeById.get(t.route_id);
        const short = src.agency === "PATH" ? (r.route_long_name || "PATH").replace(/\s*\(via Hoboken\)/i, "").trim() : r.route_short_name || r.route_id;
        const key = `${short}|${Number(t.direction_id || 0)}`;
        if (shapes[key] || !t.shape_id || !byShape.has(t.shape_id)) continue;
        shapes[key] = byShape.get(t.shape_id).sort((a, b) => a[2] - b[2]).map(([la, lo]) => [la, lo]);
      }
    }

    const fi = readTable(zip, "feed_info.txt")[0];
    if (fi?.feed_start_date) feed = { feed_start_date: fi.feed_start_date, feed_end_date: fi.feed_end_date, feed_version: fi.feed_version || "hudson" };
  }

  // Widen the validity window to whatever the calendars actually cover: the two
  // agencies publish different windows and the app refuses to plan outside it.
  const dates = [...calendar.flatMap((c) => [c.start, c.end]), ...calendarDates.map((d) => d.date)].filter((d) => /^\d{8}$/.test(d)).sort();
  if (dates.length) feed = { ...feed, feed_start_date: dates[0], feed_end_date: dates[dates.length - 1] };

  // A stop no kept trip serves is not a stop on this network. Filtering by
  // name alone kept a GROVE STREET in Montclair, twenty kilometres from Jersey
  // City, which stopsNear() would happily have offered as somewhere to walk.
  const served = new Set(departures.map((d) => d.stop));
  for (const id of Object.keys(stops)) if (!served.has(id)) { delete stops[id]; }

  // Five decimals is about a metre; the raw feed ships seven and it is a third
  // of the file.
  for (const k of Object.keys(shapes)) shapes[k] = shapes[k].map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);

  departures.sort((a, b) => a.sec - b.sec);
  const out = {
    generatedAt: new Date().toISOString(),
    source: "NJ TRANSIT rail GTFS (Hudson-Bergen Light Rail) + PATH GTFS via Trillium. Both public, no key.",
    region: "hudson",
    feed, calendar, calendarDates, stops, routes, shapes, departures,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nwrote ${OUT}`);
  console.log(`  ${Object.keys(stops).length} stops, ${routes.length} routes, ${departures.length} departures`);
  console.log(`  valid ${feed.feed_start_date}..${feed.feed_end_date}`);
}

main().catch((e) => { console.error("extract failed:", e.message); process.exit(1); });
