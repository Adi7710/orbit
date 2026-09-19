#!/usr/bin/env node
/**
 * Extract the Oakland / Squirrel Hill slice of PRT's static GTFS into
 * data/prt-oakland.json so the app can compute scheduled departures offline
 * and overlay realtime on top.
 *
 * Usage:
 *   node scripts/gtfs-extract.mjs                       # downloads GTFS.zip from PRT
 *   node scripts/gtfs-extract.mjs path/to/GTFS.zip      # uses a local zip
 *   node scripts/gtfs-extract.mjs path/to/extracted/dir # uses an extracted folder
 *
 * Source: https://www.rideprt.org/developerresources/GTFS.zip (PRT Developer
 * License Agreement applies; we use it for a non-commercial hackathon demo).
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import AdmZip from "adm-zip";

const GTFS_URL = "https://www.rideprt.org/developerresources/GTFS.zip";
const OUT = path.join(process.cwd(), "data", "prt-oakland.json");

/** Stops we care about (ids from stops.txt), with the role they play for a Pitt student. */
const STOPS = {
  "31": { role: "campus-outbound", area: "Cathedral / Hillman", note: "Forbes Ave + Bigelow Blvd, eastbound toward Squirrel Hill, Highland Park, busway" },
  "20959": { role: "campus-outbound", area: "Sennott / Posvar", note: "Forbes Ave + Bouquet St FS, eastbound" },
  "29": { role: "campus-outbound", area: "Atwood", note: "Forbes Ave + Atwood St, eastbound" },
  "34": { role: "campus-inbound", area: "Cathedral", note: "Fifth Ave + University Pl, westbound toward Downtown; alight here from Squirrel Hill / Shadyside" },
  "35": { role: "campus-inbound", area: "Benedum / Thackeray", note: "Fifth Ave + Thackeray Ave, westbound" },
  "33": { role: "campus-inbound", area: "Heinz Chapel", note: "Fifth Ave + Tennyson Ave, westbound" },
  "7095": { role: "home-inbound", area: "Squirrel Hill", note: "Forbes Ave + Shady, 61A/61B inbound toward Oakland and Downtown" },
  "7126": { role: "home-outbound", area: "Squirrel Hill", note: "Forbes Ave + Murray Ave, 61A/B/C/D outbound; alight here going home" },
  "1171": { role: "campus-inbound", area: "Bellefield", note: "Fifth Ave + Bellefield, westbound" },
  "2568": { role: "campus-outbound", area: "Bellefield", note: "Forbes Ave + Bellefield NS, eastbound" },
};
const ROUTES = new Set(["61A", "61B", "61C", "61D", "71A", "71B", "71C", "71D", "P3", "75", "67", "69", "58", "93", "54", "28X"]);

function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function* rows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line.replace(/^﻿/, ""));
    if (!header) { header = cells.map((h) => h.trim()); continue; }
    const r = {};
    header.forEach((h, i) => (r[h] = cells[i] ?? ""));
    yield r;
  }
}

function hms(s) {
  const [h, m, sec] = s.split(":").map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

async function resolveInput(arg) {
  let zipPath = arg;
  if (!arg) {
    zipPath = path.join(process.cwd(), "data", "GTFS.zip");
    console.log(`downloading ${GTFS_URL}`);
    const res = await fetch(GTFS_URL);
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  if (fs.statSync(zipPath).isDirectory()) return zipPath;
  const dir = path.join(path.dirname(zipPath), "gtfs-extracted");
  new AdmZip(zipPath).extractAllTo(dir, true);
  return dir;
}

const dir = await resolveInput(process.argv[2]);
const t0 = Date.now();

const feedInfo = [];
for await (const r of rows(path.join(dir, "feed_info.txt"))) feedInfo.push(r);
const calendar = [];
for await (const r of rows(path.join(dir, "calendar.txt"))) calendar.push(r);
const calendarDates = [];
for await (const r of rows(path.join(dir, "calendar_dates.txt"))) calendarDates.push(r);

const stops = {};
for await (const r of rows(path.join(dir, "stops.txt"))) {
  if (STOPS[r.stop_id]) stops[r.stop_id] = { id: r.stop_id, name: r.stop_name, lat: +r.stop_lat, lon: +r.stop_lon, ...STOPS[r.stop_id] };
}

const routes = {};
for await (const r of rows(path.join(dir, "routes.txt"))) {
  if (ROUTES.has(r.route_short_name)) routes[r.route_id] = { id: r.route_id, short: r.route_short_name, long: r.route_long_name, color: r.route_color };
}

const trips = {};
for await (const r of rows(path.join(dir, "trips.txt"))) {
  if (routes[r.route_id]) trips[r.trip_id] = { route: routes[r.route_id].short, service: r.service_id, headsign: r.trip_headsign, dir: +r.direction_id, start: Infinity };
}

const departures = [];
let n = 0;
for await (const r of rows(path.join(dir, "stop_times.txt"))) {
  n++;
  const t = trips[r.trip_id];
  if (!t) continue;
  const sec = hms(r.departure_time || r.arrival_time);
  if (sec < t.start) t.start = sec;
  if (stops[r.stop_id]) departures.push({ stop: r.stop_id, trip: r.trip_id, route: t.route, dir: t.dir, headsign: t.headsign, service: t.service, sec, seq: +r.stop_sequence });
}
for (const d of departures) d.tripStart = trips[d.trip].start;
departures.sort((a, b) => a.stop.localeCompare(b.stop) || a.sec - b.sec);

// Route shapes for the map: the most common shape per route+direction on weekday service, thinned to every 4th point.
const MAP_ROUTES = new Set(["61A", "61B", "61C", "61D", "71A", "71B", "71C", "71D"]);
const shapeVotes = {};
for await (const r of rows(path.join(dir, "trips.txt"))) {
  const route = routes[r.route_id]?.short;
  if (!route || !MAP_ROUTES.has(route) || r.service_id !== "2") continue;
  const k = `${route}|${r.direction_id}`;
  shapeVotes[k] ??= {};
  shapeVotes[k][r.shape_id] = (shapeVotes[k][r.shape_id] ?? 0) + 1;
}
const wantedShapes = {};
for (const [k, votes] of Object.entries(shapeVotes)) {
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  wantedShapes[best] = k;
}
const shapePts = {};
for await (const r of rows(path.join(dir, "shapes.txt"))) {
  const k = wantedShapes[r.shape_id];
  if (!k) continue;
  (shapePts[k] ??= []).push([+r.shape_pt_sequence, +(+r.shape_pt_lat).toFixed(5), +(+r.shape_pt_lon).toFixed(5)]);
}
const shapes = {};
for (const [k, pts] of Object.entries(shapePts)) {
  pts.sort((a, b) => a[0] - b[0]);
  shapes[k] = pts.filter((_, i) => i % 4 === 0 || i === pts.length - 1).map(([, lat, lon]) => [lat, lon]);
}

const out = {
  generatedAt: new Date().toISOString(),
  source: GTFS_URL,
  feed: feedInfo[0],
  calendar: calendar.map((c) => ({ id: c.service_id, days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => c[d] === "1"), start: c.start_date, end: c.end_date })),
  calendarDates: calendarDates.map((c) => ({ id: c.service_id, date: c.date, type: +c.exception_type })),
  stops,
  routes: Object.values(routes),
  shapes,
  departures,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`read ${n} stop_times rows in ${((Date.now() - t0) / 1000).toFixed(1)}s; ${departures.length} departures at ${Object.keys(stops).length} stops; wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
