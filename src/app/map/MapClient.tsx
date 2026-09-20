"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { compactDuration } from "@/core/say";

type Walk = { minutes: number; meters: number; polyline: [number, number][]; source: "google" | "estimate" };
type Option = {
  route: string; headsign: string; tripId: string;
  departsSec: number; departsText: string; scheduledText: string; status: "live" | "scheduled" | "ghost"; delaySec?: number;
  confidence: "high" | "medium" | "low"; rideIsLive: boolean;
  vehicle?: { id: string; lat: number; lon: number; bearing?: number; ageSec: number; metersToStop: number };
  leaveBySec: number; leaveByText: string; rideMinutes: number; arriveSec: number; arriveText: string;
  /** Null when there is nothing to be late for. Not the same as making it. */
  verdict: { makesIt: boolean; marginMin: number } | null;
  totalMinutes: number;
  waitMinutes: number;
  suspended?: boolean;
  /** Every stop this trip calls at between boarding and alighting, in order. */
  callingAt: { id: string; name: string; lat: number; lon: number; timeText: string }[];
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
  realtime: { tripsOk: boolean; vehiclesOk: boolean; alertsOk: boolean };
  alerts: { id: string; header: string; effect: string; movesTheStop: boolean }[];
  routeColors: Record<string, string | undefined>;
  noDirectRoute?: boolean;
  pathLive?: { station: string; ok: boolean; departures: { target: string; text: string; secondsToArrival: number }[] };
  error?: string;
};

// Fetched, not hardcoded: the list is Pittsburgh in one region and Stevens in
// the other, and a dropdown offering Cathedral to somebody in Hoboken is just
// wrong.
const FALLBACK_PLACES = ["Home"];
const REFRESH_MS = 15_000;

export default function MapClient() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const Lref = useRef<typeof L | null>(null);
  const [j, setJ] = useState<Journey | null>(null);
  // Mirrors `j` for the poll timer, so the interval never depends on state it sets.
  const latest = useRef<Journey | null>(null);
  // True once the person has panned or zoomed themselves. From then on the
  // framing is theirs, not ours.
  const userMoved = useRef(false);
  // Set while we move the map ourselves, so our own fitBounds does not get
  // mistaken for the user moving it.
  const framing = useRef(false);
  const [sel, setSel] = useState(0);
  // Leaflet is imported lazily. On a fast local API the journey and the places
  // list both arrive before the map exists, and the redraw effect ran once,
  // found no map, returned, and did not run again until the next poll -- up
  // to a minute of an empty world map at zoom 2. The map announces itself
  // here, the redraw depends on it, and Home is kept until it can be framed.
  const [mapReady, setMapReady] = useState(false);
  const homeRef = useRef<{ lat: number; lon: number } | null>(null);
  // Deep link: the Today bus card links here with the exact leg it is showing,
  // so the two screens never open on different journeys.
  const params = useSearchParams();
  const [from, setFrom] = useState<string>(params.get("from") ?? "Home");
  // No hardcoded destination: "Cathedral" is a building in the wrong state.
  // The server says which place it would pick anyway.
  const [to, setTo] = useState<string>(params.get("to") ?? "");
  // Never a typed default. "15:30" was a guess that kept measuring against a
  // class hours in the past; the timetable already knows when you have to be
  // there, and when it says nothing there is nothing to be late for.
  const [arriveBy, setArriveBy] = useState(params.get("arriveBy") ?? "");
  const [updatedAgo, setUpdatedAgo] = useState(0);
  const [err, setErr] = useState("");
  const [places, setPlaces] = useState<string[]>(FALLBACK_PLACES);
  const [classAt, setClassAt] = useState<Record<string, { title: string; startText: string }>>({});
  /** The device's own position, once it is allowed. Overrides the Home coordinates. */
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  /**
   * Ask where the phone is.
   *
   * Not on load: a permission prompt before a student has said what they want
   * is how people learn to tap Deny. It is asked when they choose to use it,
   * and the journey silently keeps working from Home if they refuse.
   */
  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLocError("This browser cannot share a location."); return; }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
        userMoved.current = false; // re-frame around where they actually are
      },
      (e) => {
        setLocating(false);
        setLocError(e.code === e.PERMISSION_DENIED ? "Location off. Planning from home instead." : "Could not get a location.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  // The device's position is the strongest fact about where the map should be.
  useEffect(() => {
    if (here && map.current && !userMoved.current) map.current.setView([here.lat, here.lon], 15);
  }, [here]);

  useEffect(() => {
    fetch("/api/transit/places")
      .then((r) => r.json())
      .then((d: { places?: { id: string; lat?: number; lon?: number; nextClass?: { title: string; startText: string } | null }[]; suggested?: string | null }) => {
        if (!d.places?.length) return;
        const ids = d.places.map((x) => x.id);
        setPlaces(ids);
        setClassAt(Object.fromEntries(d.places.filter((x) => x.nextClass).map((x) => [x.id, x.nextClass!])));
        // Preselect what Orbit would have chosen unasked, so a student going
        // where they always go taps nothing.
        const dest = (cur: string) => cur || d.suggested || ids.find((x) => x !== "Home") || ids[0];
        setTo(dest);
        setArriveBy((cur) => cur || d.places!.find((x) => x.id === dest(""))?.nextClass?.startText || "");
        // Open on the right city. The initial view was Pittsburgh coordinates.
        const home = d.places.find((x) => x.id === "Home") ?? d.places[0];
        if (home.lat && home.lon) homeRef.current = { lat: home.lat, lon: home.lon };
        if (map.current && !userMoved.current && home.lat && home.lon) map.current.setView([home.lat, home.lon], 14);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    // Opening /map with no query params meant one render with `to` still
    // empty, before the places list came back and preselected a destination.
    // That render fired a journey request for nowhere, which the API answers
    // 400, and the page showed "unknown place" to anyone who reached the map
    // by its own URL rather than by tapping the bus card.
    if (!from || !to) return;
    const qs = new URLSearchParams({ from, to });
    if (to !== "Home" && arriveBy) qs.set("arriveBy", arriveBy);
    // The server picks the nearest served stop to wherever this actually is,
    // rather than to the Home coordinates.
    if (here) { qs.set("lat", String(here.lat)); qs.set("lon", String(here.lon)); }
    try {
      const r = await fetch(`/api/transit/journey?${qs}`);
      const data: Journey = await r.json();
      if (data.error) { setErr(data.error); return; }
      setErr("");
      setJ(data);
      latest.current = data;
      setUpdatedAgo(0);
      setSel((s) => Math.min(s, Math.max(0, data.options.length - 1)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [from, to, arriveBy, here]);

  /**
   * Polling that matches how fast the answer actually changes.
   *
   * A fixed fifteen seconds burned three PRT feeds a minute whether or not the
   * page was on screen and whether or not anything was live -- including in a
   * background tab nobody was looking at. A timetable-only departure an hour
   * out does not change every fifteen seconds, and a hidden tab changes
   * nothing at all.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const period = () => {
      if (document.visibilityState === "hidden") return null;      // nobody is looking
      // Read the latest journey from a ref, not from the closure. Depending on
      // `j` here would tear down and rebuild this timer on every single fetch,
      // because load() sets it.
      const cur = latest.current;
      const anyLive = cur?.options.some((o) => o.status === "live" && o.vehicle);
      const soonest = cur?.options[0] ? (cur.options[0].departsSec - cur.clock.sec) / 60 : 99;
      if (anyLive && soonest <= 20) return REFRESH_MS;             // a bus is moving and it is close
      if (anyLive) return REFRESH_MS * 2;
      return REFRESH_MS * 4;                                        // timetable only: nothing to refresh
    };

    const tick = async () => {
      if (stopped) return;
      const ms = period();
      if (ms !== null) await load();
      if (!stopped) timer = setTimeout(tick, ms ?? REFRESH_MS);
    };

    load();
    timer = setTimeout(tick, period() ?? REFRESH_MS);
    // Catch up straight away when the tab comes back, rather than showing a
    // stale bus until the next tick.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    const q = new URLSearchParams({ from, to });
    if (to !== "Home") q.set("arriveBy", arriveBy);
    window.history.replaceState(null, "", `/map?${q}`);
  }, [from, to, arriveBy, here]);
  useEffect(() => { const t = setInterval(() => setUpdatedAgo((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || map.current) return;
      Lref.current = leaflet;
      // No hardcoded city. This opened on Pittsburgh coordinates and stayed
      // there until the places list came back, so the first thing a student in
      // Hoboken saw was Oakland. Start unset and let the first real fact --
      // the device's location, or Home from the places list -- decide.
      map.current = leaflet.map(mapEl.current, { zoomControl: false, attributionControl: true });
      map.current.setView([0, 0], 2);
      // OpenStreetMap's own tiles, which need no key.
      //
      // CARTO's basemaps now require one and do not fail honestly about it:
      // they return HTTP 200 with "API KEY REQUIRED" painted across every
      // tile, so the map looks broken rather than unauthorised. OSM asks for a
      // real referer and sane usage instead, which the backed-off polling
      // already gives it.
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · transit data © NJ TRANSIT / PATH',
        maxZoom: 19,
      }).addTo(map.current);
      leaflet.control.zoom({ position: "topright" }).addTo(map.current);
      layers.current = leaflet.layerGroup().addTo(map.current);
      // dragstart and a zoom that we did not start are the honest signals that
      // the person took over. Leaflet fires movestart for our own fitBounds too.
      map.current.on("dragstart", () => { userMoved.current = true; });
      map.current.on("zoomstart", () => { if (!framing.current) userMoved.current = true; });
      // If the places list beat the import, Home is already known: frame it now
      // rather than leaving the world at zoom 2 until something else moves it.
      if (homeRef.current && !userMoved.current) map.current.setView([homeRef.current.lat, homeRef.current.lon], 14);
      setMapReady(true);
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
    // Every other option, faint. Seeing that three routes run the same way with
    // one picked out tells you more than a single line on an empty map, and it
    // makes choosing a different chip read as a change of emphasis rather than
    // a redraw.
    j.options.forEach((alt, i) => {
      if (i === sel || alt.shape.length < 2) return;
      leaflet.polyline(alt.shape, { color: `#${j.routeColors[alt.route] ?? "94a3b8"}`, weight: 3, opacity: 0.18, interactive: false }).addTo(g);
    });

    // The ride: from the bus (or the stop) to where you get off.
    if (o && o.shape.length > 1) {
      leaflet.polyline(o.shape, { color, weight: 6, opacity: 0.35 }).addTo(g);
      leaflet.polyline(o.shape, { color, weight: 3.5, opacity: 1 }).addTo(g);
    }
    // Stops.
    // The stops in between. A line with only two markers on it hides what
    // people orient by mid-journey: which stop is next, and how many are left.
    for (const c of o?.callingAt ?? []) {
      if (c.id === j.boardStop.id || c.id === j.alightStop.id) continue;
      leaflet
        .circleMarker([c.lat, c.lon], { radius: 4, color, weight: 2, fillColor: "#ffffff", fillOpacity: 1 })
        .addTo(g)
        .bindTooltip(`${c.name.toLowerCase()} · ${c.timeText}`, { direction: "top" });
    }

    const stopPin = (label: string) => pin(`<div class="stop"><span>${label}</span></div>`, [26, 26]);
    // Permanent labels. Hover tooltips do not exist on a phone and are
    // invisible to anyone reading the screen at arm's length, which is the
    // only way this screen is ever read.
    const label = (text: string, sub: string) =>
      leaflet.divIcon({
        className: "orbit-label",
        html: `<div class="lbl"><b>${text}</b><span>${sub}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [-14, 8],
      });
    leaflet.marker([j.boardStop.lat, j.boardStop.lon], { icon: stopPin("B") }).addTo(g);
    leaflet.marker([j.boardStop.lat, j.boardStop.lon], { icon: label("Get on", j.boardStop.name.toLowerCase()), interactive: false }).addTo(g);
    leaflet.marker([j.alightStop.lat, j.alightStop.lon], { icon: stopPin("A") }).addTo(g);
    leaflet.marker([j.alightStop.lat, j.alightStop.lon], { icon: label("Get off", j.alightStop.name.toLowerCase()), interactive: false }).addTo(g);
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
    // Only frame the journey when the map is still ours to frame.
    //
    // This used to run on every redraw, and the page polls -- so panning away
    // to look at your stop, or zooming in on the bus, got undone a few seconds
    // later by the next refresh. A map that fights the person holding it is
    // worse than one that never moves. Once they touch it, framing becomes
    // their job and the recenter button is how they hand it back.
    if (!userMoved.current) {
      // animate: false, so zoomstart fires inside this guard. Animated
      // framing raised zoomstart after the guard was cleared, which counted
      // our own framing as the person taking over and switched auto-framing
      // off for good.
      framing.current = true;
      map.current.fitBounds(leaflet.latLngBounds(pts).pad(0.18), { animate: false });
      framing.current = false;
    }
  }, [j, sel, mapReady]);

  /** Put the journey back in frame, and resume auto-framing. */
  const recenter = useCallback(() => {
    const leaflet = Lref.current;
    if (!leaflet || !map.current || !j) return;
    userMoved.current = false;
    const o = j.options[sel];
    const pts: [number, number][] = [[j.origin.lat, j.origin.lon], [j.boardStop.lat, j.boardStop.lon], [j.alightStop.lat, j.alightStop.lon], [j.destination.lat, j.destination.lon]];
    if (o?.vehicle) pts.push([o.vehicle.lat, o.vehicle.lon]);
    framing.current = true;
    map.current.fitBounds(leaflet.latLngBounds(pts).pad(0.18), { animate: false });
    framing.current = false;
  }, [j, sel]);

  const o = j?.options[sel];
  const verdictTone = !o?.verdict ? "" : !o.verdict.makesIt ? "bg-danger" : o.verdict.marginMin < 5 ? "bg-warn" : "bg-build";
  const leaveInMin = o && j ? Math.round((o.leaveBySec - j.clock.sec) / 60) : 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-surface-2">
      <div ref={mapEl} className="absolute inset-0" />

      {/* Destination first.
          Opening on a map and a timetable asks a student to work out what they
          are looking at. Asking one question first -- where are you going --
          means every number that follows is an answer to something they said.
          It disappears the moment they choose, and never comes back. */}
      {!j && (
        <div className="absolute inset-0 z-[700] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h2 className="text-lg font-semibold tracking-tight">Where are you going?</h2>
            <p className="mt-1 text-sm text-ink-2">
              {here ? "Planning from where you are now." : "Planning from home until you share a location."}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {places.filter((p) => p !== "Home").map((p) => (
                <button
                  key={p}
                  onClick={() => { setTo(p); setArriveBy(classAt[p]?.startText ?? ""); }}
                  className="rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:border-primary"
                >
                  <span className="font-medium">{p}</span>
                  {classAt[p] && <span className="block text-xs text-ink-2">{classAt[p].startText} · {classAt[p].title}</span>}
                </button>
              ))}
              <button onClick={() => setTo("Home")} className="rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:border-primary">
                <span className="font-medium">Home</span>
                <span className="block text-xs text-ink-2">head back</span>
              </button>
            </div>

            <button
              onClick={locate}
              disabled={locating}
              className="mt-4 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {locating ? "Finding you…" : here ? "Using your location" : "Use my location"}
            </button>
            {locError && <p className="mt-2 text-xs text-warn">{locError}</p>}
          </div>
        </div>
      )}

      {/* Offered only once framing has become theirs, so it is an answer to a
          state they created rather than a permanent piece of furniture. */}
      <button
        onClick={recenter}
        className="absolute right-3 top-24 z-[600] min-h-11 rounded-full border border-line bg-background/95 px-4 text-xs font-medium shadow-lg backdrop-blur hover:border-line"
      >
        Recenter
      </button>

      {/* Location, always reachable once the sheet is gone. */}
      <button
        onClick={locate}
        disabled={locating}
        title={here ? "Planning from your location" : "Plan from where you are"}
        className={`absolute right-3 top-36 z-[600] rounded-full border bg-background/95 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur disabled:opacity-50 ${here ? "border-primary text-primary" : "border-line hover:border-line"}`}
      >
        {locating ? "…" : here ? "Using you" : "Locate me"}
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-background/95 p-2 shadow-lg backdrop-blur">
          <a href="/" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-ink transition hover:bg-surface-2" aria-label="Back to today">‹ Orbit</a>
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Travelling from" className="min-h-11 rounded-lg border px-2 text-sm">{places.map((p) => <option key={p}>{p}</option>)}</select>
          <span aria-hidden="true" className="text-ink-2">→</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Travelling to" className="min-h-11 rounded-lg border px-2 text-sm">{places.map((p) => <option key={p}>{p}</option>)}</select>
          {/* The timetable knows when you have to be there. Typing a time is
              how the map ended up measuring against a class five hours past,
              so this states what Orbit read and offers to drop it, rather
              than asking a student to supply a fact about their own day. */}
          {classAt[to] ? (
            <span className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1 text-sm text-ink">
              {classAt[to].title} at {classAt[to].startText}
              {arriveBy && (
                <button onClick={() => setArriveBy("")} className="min-h-11 min-w-11 text-ink-2 hover:text-ink" aria-label="Ignore the class deadline">×</button>
              )}
            </span>
          ) : (
            <span className="text-sm text-ink-2">nothing to catch</span>
          )}
          <span className="ml-auto pr-2 text-xs text-ink-2">
            {j?.clock.simulated ? `demo clock ${j.clock.text}` : `now ${j?.clock.text ?? "--:--"}`} · {j?.realtime.tripsOk ? "PRT live" : "schedule only"} · updated {updatedAgo}s ago
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-background/97 p-4 shadow-2xl backdrop-blur">
          {err && <p className="text-sm text-danger">{err}</p>}
          {!j && !err && <p className="text-sm text-ink-2">Reading the timetable…</p>}
          {j && j.options.length === 0 && (
            <p className="text-sm text-ink-2">
              {/* "No bus" and "no bus without changing" are different answers,
                  and only one of them means start walking. */}
              {j.noDirectRoute
                ? "No direct service between these two stops. Orbit does not plan changes yet, so this one needs the app you already use."
                : "Nothing you could still catch in the next 90 minutes. Walking is the plan."}
            </p>
          )}

          {o && j && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {leaveInMin <= 0 ? "Leave now" : `Leave in ${compactDuration(leaveInMin)}`}
                    <span className="ml-2 text-base font-normal text-ink-2">({o.leaveByText})</span>
                  </div>
                </div>
                {/* A verdict needs something to be late for. With no class
                    ahead, "you make it" is a green badge meaning nothing — so
                    say how long the whole trip takes instead, which is the
                    number a person wanted anyway. */}
                {o.verdict ? (
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white ${verdictTone}`}>
                    <span className="h-2 w-2 rounded-full bg-background/90" />
                    {o.verdict.makesIt ? `you make it, ${o.verdict.marginMin} min to spare` : `you miss it by ${Math.abs(o.verdict.marginMin)} min`}
                  </div>
                ) : (
                  <div className="rounded-full bg-primary px-3 py-1 text-sm font-medium text-white">
                    {compactDuration(o.totalMinutes)} door to door
                  </div>
                )}
              </div>

              {/* PATH is the one live source in Hudson County that needs no
                  account, and it was arriving in the response and rendering
                  nowhere. Kept separate from the itinerary because its board
                  publishes no trip ids: these are real trains, but they cannot
                  honestly be attached to a timetable row above. */}
              {j.pathLive?.ok && j.pathLive.departures.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="text-xs font-medium text-ink-2">PATH from {j.pathLive.station} · live</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {j.pathLive.departures.map((d, i) => (
                      <span key={i} className="tabular-nums">
                        <b>{d.target}</b> <span className="text-ink-2">{d.text}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* A stop move belongs above the itinerary, not under it. Every
                  line below assumes you are standing at a pole that, today,
                  Pittsburgh Transit says has been moved. */}
              {j.alerts?.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {j.alerts.slice(0, 2).map((a) => (
                    <li key={a.id} className={`rounded-xl border px-3 py-2 text-xs ${a.movesTheStop ? "border-warn bg-warn/10 text-warn" : "border-line bg-surface text-ink-2"}`}>
                      <span className="font-medium">{a.movesTheStop ? "Stop moved" : "Notice"}</span>
                      <span className="mx-1.5 text-ink-2">·</span>
                      {a.header}
                      {a.movesTheStop && <span className="mt-0.5 block text-warn">Check the pole before you settle in — the times below assume the usual one.</span>}
                    </li>
                  ))}
                </ul>
              )}

              <ol className="mt-3 space-y-1.5 text-sm">
                <li className="flex gap-3"><span className="w-6">🚶</span><span className="w-16 tabular-nums text-ink-2">{compactDuration(j.walkToStop.minutes)}</span><span>walk to {j.boardStop.name.toLowerCase()}{j.walkToStop.source === "estimate" && <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-xs text-warn">estimated</span>}</span></li>
                <li className="flex gap-3"><span className="w-6">🚌</span><span className="w-16 tabular-nums text-ink-2">{o.departsText}</span>
                  <span>
                    <b>{o.route}</b> {o.headsign.toLowerCase()}
                    {o.status === "live" && <span className="ml-2 rounded bg-build/10 px-1.5 py-0.5 text-xs text-build">live{o.delaySec && Math.abs(o.delaySec) > 59 ? ` · ${Math.round(o.delaySec / 60)} min ${o.delaySec > 0 ? "late" : "early"}` : ""}</span>}
                    {o.status === "scheduled" && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">scheduled {o.scheduledText}</span>}
                    {o.status === "ghost" && <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-xs text-warn">not on the live feed</span>}
                    {o.vehicle && <span className="ml-2 text-ink-2">bus {o.vehicle.id} is {(o.vehicle.metersToStop / 1000).toFixed(1)} km away</span>}
                    {/* "The 61B is at 20:33" reads the same whether it came
                        from a bus four hundred metres away or a timetable
                        printed in August. Say which. */}
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${o.confidence === "high" ? "bg-build/10 text-build" : o.confidence === "medium" ? "bg-surface-2 text-ink-2" : "bg-warn/10 text-warn"}`}>
                      {o.confidence === "high" ? "confident" : o.confidence === "medium" ? "rough" : "timetable only"}
                    </span>
                  </span>
                </li>
                {o.waitMinutes > 2 && (
                  <li className="flex gap-3 text-ink-2"><span className="w-6">⏳</span><span className="w-16 tabular-nums">{compactDuration(o.waitMinutes)}</span><span>wait at the stop</span></li>
                )}
                <li className="flex gap-3"><span className="w-6">🪑</span><span className="w-16 tabular-nums text-ink-2">{compactDuration(o.rideMinutes)}</span><span>ride to {j.alightStop.name.toLowerCase()}{o.rideIsLive ? <span className="ml-2 rounded bg-build/10 px-1.5 py-0.5 text-xs text-build">live prediction</span> : <span className="ml-2 text-xs text-ink-2">scheduled</span>}</span></li>
                <li className="flex gap-3"><span className="w-6">🚶</span><span className="w-16 tabular-nums text-ink-2">{compactDuration(j.walkToDest.minutes)}</span><span>walk to {j.destination.label}{j.walkToDest.source === "estimate" && <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-xs text-warn">estimated</span>}</span></li>
                <li className="flex gap-3 font-medium"><span className="w-6">🎓</span><span className="w-16 tabular-nums">{o.arriveText}</span><span>arrive{j.destination.arriveByText ? ` · class at ${j.destination.arriveByText}` : ` · ${compactDuration(o.totalMinutes)} door to door`}</span></li>
              </ol>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {j.options.map((opt, i) => (
                  <button key={opt.tripId} onClick={() => setSel(i)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs ${i === sel ? "border-primary bg-primary text-white" : "border-line bg-background hover:border-line"} ${opt.status === "ghost" ? "line-through opacity-60" : ""}`}>
                    <div className="font-semibold">{opt.route} · {opt.departsText}</div>
                    <div className={i === sel ? "text-ink-3" : "text-ink-2"}>leave {opt.leaveByText} · arrive {opt.arriveText}</div>
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
        /* Always-on labels. A hover tooltip does not exist on a phone, and
           this screen is read at arm's length while walking. White halo so a
           name stays legible over a road, a park or the river. */
        .orbit-label .lbl { display: flex; flex-direction: column; line-height: 1.15; white-space: nowrap; font: 600 11px/1.15 ui-sans-serif, system-ui; color: #111827;
          text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 6px #fff; pointer-events: none; }
        .orbit-label .lbl span { font-weight: 500; font-size: 10px; color: #4b5563; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  );
}
