"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";

type Walk = { minutes: number; meters: number; polyline: [number, number][]; source: "google" | "estimate" };
type Option = {
  route: string; headsign: string; tripId: string;
  departsSec: number; departsText: string; scheduledText: string; status: "live" | "scheduled" | "ghost"; delaySec?: number;
  vehicle?: { id: string; lat: number; lon: number; bearing?: number; ageSec: number; metersToStop: number };
  leaveBySec: number; leaveByText: string; rideMinutes: number; arriveSec: number; arriveText: string;
  verdict: { makesIt: boolean; marginMin: number };
  shape: [number, number][];
};
type Journey = {
  clock: { sec: number; text: string; simulated: boolean };
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string; arriveByText?: string };
  boardStop: { id: string; name: string; lat: number; lon: number };
  alightStop: { id: string; name: string; lat: number; lon: number };
  walkToStop: Walk; walkToDest: Walk;
  options: Option[];
  realtime: { tripsOk: boolean; vehiclesOk: boolean };
  routeColors: Record<string, string | undefined>;
  error?: string;
};

const PLACES = ["Home", "Cathedral", "Hillman", "Posvar", "Sennott", "Benedum"] as const;
const REFRESH_MS = 15_000;

export default function MapClient() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const Lref = useRef<typeof L | null>(null);
  const [j, setJ] = useState<Journey | null>(null);
  const [sel, setSel] = useState(0);
  // Deep link: the Today bus card links here with the exact leg it is showing,
  // so the two screens never open on different journeys.
  const params = useSearchParams();
  const [from, setFrom] = useState<string>(params.get("from") ?? "Home");
  const [to, setTo] = useState<string>(params.get("to") ?? "Cathedral");
  const [arriveBy, setArriveBy] = useState(params.get("arriveBy") ?? "15:30");
  const [updatedAgo, setUpdatedAgo] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ from, to });
    if (to !== "Home" && arriveBy) qs.set("arriveBy", arriveBy);
    try {
      const r = await fetch(`/api/transit/journey?${qs}`);
      const data: Journey = await r.json();
      if (data.error) { setErr(data.error); return; }
      setErr("");
      setJ(data);
      setUpdatedAgo(0);
      setSel((s) => Math.min(s, Math.max(0, data.options.length - 1)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [from, to, arriveBy]);

  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    const q = new URLSearchParams({ from, to });
    if (to !== "Home") q.set("arriveBy", arriveBy);
    window.history.replaceState(null, "", `/map?${q}`);
  }, [from, to, arriveBy]);
  useEffect(() => { const t = setInterval(() => setUpdatedAgo((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || map.current) return;
      Lref.current = leaflet;
      map.current = leaflet.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([40.4426, -79.9497], 14);
      leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO · transit data © Pittsburgh Regional Transit',
        maxZoom: 19,
      }).addTo(map.current);
      leaflet.control.zoom({ position: "topright" }).addTo(map.current);
      layers.current = leaflet.layerGroup().addTo(map.current);
    })();
    return () => { cancelled = true; };
  }, []);

  // Redraw whenever the journey or the selected option changes.
  useEffect(() => {
    const leaflet = Lref.current;
    if (!leaflet || !map.current || !layers.current || !j) return;
    const g = layers.current;
    g.clearLayers();
    const o = j.options[sel];
    const color = o ? `#${j.routeColors[o.route] ?? "1e90ff"}` : "#1e90ff";

    const pin = (html: string, size: [number, number] = [34, 34]) => leaflet.divIcon({ html, className: "orbit-pin", iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });

    // Walk legs, dashed.
    for (const w of [j.walkToStop, j.walkToDest]) {
      if (w.polyline.length > 1) leaflet.polyline(w.polyline, { color: "#6b7280", weight: 3, dashArray: "2 7", opacity: 0.9 }).addTo(g);
    }
    // The ride: from the bus (or the stop) to where you get off.
    if (o && o.shape.length > 1) {
      leaflet.polyline(o.shape, { color, weight: 6, opacity: 0.35 }).addTo(g);
      leaflet.polyline(o.shape, { color, weight: 3.5, opacity: 1 }).addTo(g);
    }
    // Stops.
    const stopPin = (label: string) => pin(`<div class="stop"><span>${label}</span></div>`, [26, 26]);
    leaflet.marker([j.boardStop.lat, j.boardStop.lon], { icon: stopPin("B") }).addTo(g).bindTooltip(`Board: ${j.boardStop.name}`, { direction: "top" });
    leaflet.marker([j.alightStop.lat, j.alightStop.lon], { icon: stopPin("A") }).addTo(g).bindTooltip(`Get off: ${j.alightStop.name}`, { direction: "top" });
    // You and the destination.
    leaflet.marker([j.origin.lat, j.origin.lon], { icon: pin(`<div class="you"></div>`, [22, 22]) }).addTo(g).bindTooltip(`You · ${j.origin.label}`, { direction: "top" });
    leaflet.marker([j.destination.lat, j.destination.lon], { icon: pin(`<div class="dest">🎓<span>${j.destination.arriveByText ?? ""}</span></div>`, [64, 30]) }).addTo(g).bindTooltip(`${j.destination.label}${j.destination.arriveByText ? ` · class ${j.destination.arriveByText}` : ""}`, { direction: "top" });
    // The bus.
    if (o?.vehicle) {
      const rot = o.vehicle.bearing ?? 0;
      leaflet.marker([o.vehicle.lat, o.vehicle.lon], {
        icon: pin(`<div class="bus" style="--c:${color}"><i style="transform:rotate(${rot}deg)">▲</i><b>${o.route}</b></div>`, [70, 30]),
        zIndexOffset: 1000,
      }).addTo(g).bindTooltip(`${o.route} · bus ${o.vehicle.id} · ${(o.vehicle.metersToStop / 1000).toFixed(1)} km from your stop · fix ${o.vehicle.ageSec}s old`, { direction: "top" });
    }

    const pts: [number, number][] = [[j.origin.lat, j.origin.lon], [j.boardStop.lat, j.boardStop.lon], [j.alightStop.lat, j.alightStop.lon], [j.destination.lat, j.destination.lon]];
    if (o?.vehicle) pts.push([o.vehicle.lat, o.vehicle.lon]);
    map.current.fitBounds(leaflet.latLngBounds(pts).pad(0.18), { animate: true });
  }, [j, sel]);

  const o = j?.options[sel];
  const verdictTone = !o ? "" : !o.verdict.makesIt ? "bg-red-500" : o.verdict.marginMin < 5 ? "bg-amber-500" : "bg-emerald-500";
  const leaveInMin = o && j ? Math.round((o.leaveBySec - j.clock.sec) / 60) : 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-100">
      <div ref={mapEl} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-lg backdrop-blur">
          <a href="/" className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100" aria-label="Back to today">‹ Orbit</a>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">{PLACES.map((p) => <option key={p}>{p}</option>)}</select>
          <span className="text-zinc-400">→</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">{PLACES.map((p) => <option key={p}>{p}</option>)}</select>
          {to !== "Home" && (
            <label className="flex items-center gap-1 text-sm text-zinc-600">class at
              <input value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} className="w-16 rounded-lg border px-2 py-1" />
            </label>
          )}
          <span className="ml-auto pr-2 text-xs text-zinc-500">
            {j?.clock.simulated ? `demo clock ${j.clock.text}` : `now ${j?.clock.text ?? "--:--"}`} · {j?.realtime.tripsOk ? "PRT live" : "schedule only"} · updated {updatedAgo}s ago
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white/97 p-4 shadow-2xl backdrop-blur">
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!j && !err && <p className="text-sm text-zinc-500">Reading the timetable…</p>}
          {j && j.options.length === 0 && <p className="text-sm text-zinc-600">No bus you could still catch in the next 90 minutes. Walking is the plan.</p>}

          {o && j && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {leaveInMin <= 0 ? "Leave now" : `Leave in ${leaveInMin} min`}
                    <span className="ml-2 text-base font-normal text-zinc-500">({o.leaveByText})</span>
                  </div>
                </div>
                <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white ${verdictTone}`}>
                  <span className="h-2 w-2 rounded-full bg-white/90" />
                  {o.verdict.makesIt ? `you make it${j.destination.arriveByText ? `, ${o.verdict.marginMin} min to spare` : ""}` : `you miss it by ${Math.abs(o.verdict.marginMin)} min`}
                </div>
              </div>

              <ol className="mt-3 space-y-1.5 text-sm">
                <li className="flex gap-3"><span className="w-6">🚶</span><span className="w-16 tabular-nums text-zinc-500">{j.walkToStop.minutes} min</span><span>walk to {j.boardStop.name.toLowerCase()}{j.walkToStop.source === "estimate" ? "" : " (Google)"}</span></li>
                <li className="flex gap-3"><span className="w-6">🚌</span><span className="w-16 tabular-nums text-zinc-500">{o.departsText}</span>
                  <span>
                    <b>{o.route}</b> {o.headsign.toLowerCase()}
                    {o.status === "live" && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">live{o.delaySec && Math.abs(o.delaySec) > 59 ? ` · ${Math.round(o.delaySec / 60)} min ${o.delaySec > 0 ? "late" : "early"}` : ""}</span>}
                    {o.status === "scheduled" && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">scheduled {o.scheduledText}</span>}
                    {o.status === "ghost" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">not on the live feed</span>}
                    {o.vehicle && <span className="ml-2 text-zinc-500">bus {o.vehicle.id} is {(o.vehicle.metersToStop / 1000).toFixed(1)} km away</span>}
                  </span>
                </li>
                <li className="flex gap-3"><span className="w-6">🪑</span><span className="w-16 tabular-nums text-zinc-500">{o.rideMinutes} min</span><span>ride to {j.alightStop.name.toLowerCase()}</span></li>
                <li className="flex gap-3"><span className="w-6">🚶</span><span className="w-16 tabular-nums text-zinc-500">{j.walkToDest.minutes} min</span><span>walk to {j.destination.label}</span></li>
                <li className="flex gap-3 font-medium"><span className="w-6">🎓</span><span className="w-16 tabular-nums">{o.arriveText}</span><span>arrive{j.destination.arriveByText ? ` · class at ${j.destination.arriveByText}` : ""}</span></li>
              </ol>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {j.options.map((opt, i) => (
                  <button key={opt.tripId} onClick={() => setSel(i)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs ${i === sel ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:border-zinc-400"} ${opt.status === "ghost" ? "line-through opacity-60" : ""}`}>
                    <div className="font-semibold">{opt.route} · {opt.departsText}</div>
                    <div className={i === sel ? "text-zinc-300" : "text-zinc-500"}>leave {opt.leaveByText} · arrive {opt.arriveText}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .orbit-pin { background: none; border: none; }
        .orbit-pin .you { width: 18px; height: 18px; border-radius: 999px; background: #2563eb; border: 3px solid #fff; box-shadow: 0 0 0 4px rgba(37,99,235,.25), 0 1px 4px rgba(0,0,0,.3); }
        .orbit-pin .stop { width: 22px; height: 22px; border-radius: 999px; background: #fff; border: 3px solid #111827; display: grid; place-items: center; font: 700 10px/1 ui-sans-serif, system-ui; color: #111827; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
        .orbit-pin .dest { display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: #111827; color: #fff; font: 600 11px/1 ui-sans-serif, system-ui; box-shadow: 0 2px 6px rgba(0,0,0,.35); white-space: nowrap; }
        .orbit-pin .bus { display: flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; background: var(--c); color: #0b0b0b; font: 800 12px/1 ui-sans-serif, system-ui; box-shadow: 0 2px 8px rgba(0,0,0,.4); border: 2px solid #fff; white-space: nowrap; }
        .orbit-pin .bus i { font-style: normal; display: inline-block; font-size: 10px; }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  );
}
