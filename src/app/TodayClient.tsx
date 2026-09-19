"use client";

import { useCallback, useEffect, useState } from "react";
import LedgerReveal from "./LedgerReveal";
import WatcherPanel from "./WatcherPanel";
import VoiceButton from "./VoiceButton";
import EmailModal from "./EmailModal";

type Today = {
  mode: "normal" | "crisis" | "chill";
  user: { name: string; xpWeek: number; streakWeeks: number; group: string };
  ledger: { usable: number; naiveFree: number; travel: number; meals: number; routines: number; fixed: number; queued: number; slack: number; overCommitted: boolean };
  gaps: { id: string; startText: string; endText: string; usable: number; fromPlace?: string; isEvening: boolean; pick: { id: string; title: string; estimateMinutes: number } | null }[];
  quests: { id: string; title: string; xp: number; kind: string; expiresText: string }[];
  bus: { route: string; headsign: string; leaveByText: string; departsText: string; arrivalText: string; status: "live" | "scheduled" | "ghost"; live: boolean; ghost: boolean; delaySec?: number; from: string; to: string; why: string; stopName: string; alightName: string; walkToStop: number; walkToDest: number; rideMinutes: number; vehicleKm: number | null; verdict: { makesIt: boolean; marginMin: number } | null; classAtText: string | null; mapHref: string } | null;
  ghosts: { route: string }[];
  arrivals: { route: string; text: string; realtime: boolean; status: "live" | "scheduled" | "ghost"; headsign: string; leaveByText: string; arriveText: string; makesIt: boolean; marginMin: number }[];
  transit: { clockText: string; simulated: boolean; realtimeOk: boolean; walkSource: string };
  shared: { startText: string; endText: string; minutes: number; names: string[] }[];
  tasks: { id: string; title: string; planningMinutes: number; estimateMinutes: number; courseCode?: string; dueAt?: string }[];
  cuts: { task: { title: string }; minutesSaved: number; reason: string }[];
  calibration: { key: string; samples: number; multiplier: number }[];
  proposals: { id: string; status: string; proposal: { kind: string; reason: string; body?: string; to?: string; subject?: string; courseCode?: string; building?: string; message?: string } }[];
  events: { seq: number; ts: string; actor: string; type: string; payload: unknown }[];
};

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export default function TodayClient() {
  const [t, setT] = useState<Today | null>(null);
  const [narration, setNarration] = useState("");
  const [board, setBoard] = useState<{ rank: number; name: string; xpWeek: number; streakWeeks: number; group?: string }[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [voiceLive, setVoiceLive] = useState(false);
  const [timetableUrl, setTimetableUrl] = useState("");
  const [canvasUrl, setCanvasUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState("");

  /**
   * The day and the board are fetched independently: a board that fails must
   * never leave the whole screen on "Loading your day…" forever, which is
   * exactly what a single Promise.all with no catch used to do.
   */
  const refresh = useCallback(async () => {
    const get = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${url} returned ${r.status}`);
      return r.json();
    };
    try {
      setT(await get("/api/today"));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    try {
      setBoard((await get("/api/leaderboard?group=Tower%20A")).rows);
    } catch {
      /* the board is decoration; the day is not */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // While a call is live, poll. The agent can write an email at any point in
  // a conversation, and the draft window has to be open by the time it stops
  // speaking -- waiting for the next message callback is a second or two too
  // late and leaves the student looking at nothing.
  useEffect(() => {
    if (!voiceLive) return;
    const id = setInterval(() => refresh(), 2500);
    return () => clearInterval(id);
  }, [voiceLive, refresh]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const plan = async () => {
    setBusy(true);
    const r = await fetch("/api/plan", { method: "POST" }).then((r) => r.json());
    setNarration(`${r.narration} (${r.provider})`);
    setBusy(false);
    refresh();
  };

  const decide = async (id: string, decision: "approve" | "decline") => {
    const r = await fetch(`/api/proposals/${id}`, { method: "POST", body: JSON.stringify({ decision }), headers: { "Content-Type": "application/json" } }).then((r) => r.json());
    if (r.effect) say(r.effect);
    refresh();
  };

  const complete = async (taskId: string, planned: number) => {
    const actual = Number(prompt("How many minutes did it actually take?", String(planned)) ?? planned);
    const r = await fetch("/api/complete", { method: "POST", body: JSON.stringify({ taskId, actualMinutes: actual }), headers: { "Content-Type": "application/json" } }).then((r) => r.json());
    if (r.ok) say(`+${r.xp} XP: ${r.reasons.join(", ")}`);
    refresh();
  };

  const importCalendars = async (sample: boolean) => {
    setImporting(true);
    setImportNote("");
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample ? { sample: true } : { timetableUrl: timetableUrl.trim() || undefined, canvasUrl: canvasUrl.trim() || undefined }),
      }).then((r) => r.json());
      const parts: string[] = [];
      if (r.timetable) parts.push(`${r.timetable.blocks} class${r.timetable.blocks === 1 ? "" : "es"} on ${r.day}`);
      if (r.canvas) parts.push(`${r.canvas.added + r.canvas.updated} Canvas task${r.canvas.added + r.canvas.updated === 1 ? "" : "s"}`);
      const problems = [...(r.warnings ?? []), ...Object.entries(r.errors ?? {}).map(([k, v]) => `${k}: ${v}`)];
      if (r.error) problems.push(r.error);
      setImportNote([parts.length ? `Imported ${parts.join(" and ")}.` : "", ...problems].filter(Boolean).join(" "));
      if (parts.length) say(`Imported ${parts.join(" and ")}`);
    } catch {
      setImportNote("Import failed. Is the server reachable?");
    }
    setImporting(false);
    refresh();
  };

  const setMode = async (mode: Today["mode"]) => {
    await fetch("/api/mode", { method: "POST", body: JSON.stringify({ mode }), headers: { "Content-Type": "application/json" } });
    refresh();
  };

  if (!t)
    return (
      <main className="mx-auto max-w-lg p-8">
        {loadError ? (
          <>
            <h1 className="text-lg font-semibold">Could not load your day</h1>
            <p className="mt-2 text-sm text-zinc-600">{loadError}</p>
            <button onClick={refresh} className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white">Try again</button>
          </>
        ) : (
          <p className="text-zinc-500">Loading your day…</p>
        )}
      </main>
    );
  const lost = t.ledger.naiveFree - t.ledger.usable;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8 grid gap-6 md:grid-cols-3">
      <header className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orbit</h1>
          <p className="text-sm text-zinc-500">Your calendar lies about how much time you have. Orbit doesn&apos;t.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {(["normal", "crisis", "chill"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 border ${t.mode === m ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300"}`}>{m}</button>
          ))}
          <span className="ml-3 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{t.user.xpWeek} XP · {t.user.streakWeeks}-wk streak</span>
        </div>
      </header>

      <EmailModal
        pending={t.proposals.find((p) => p.status === "pending" && p.proposal.kind === "send_email") as never}
        onDone={refresh}
      />

      <VoiceButton onChange={refresh} voiceActive={setVoiceLive} />

      <WatcherPanel onChange={refresh} />

      <LedgerReveal l={t.ledger} />
      {t.cuts.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 md:col-span-2">
          <h2 className="text-sm font-medium text-red-700">The day will not fit. Cheapest way back:</h2>
          <ul className="mt-2 text-sm text-zinc-700">{t.cuts.map((c) => <li key={c.task.title}>Drop <b>{c.task.title}</b> · saves {c.minutesSaved} min · {c.reason}</li>)}</ul>
        </section>
      )}

      <section className="rounded-2xl border p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-500">Bus</h2>
          <span className="text-[11px] text-zinc-400">
            {t.transit.simulated ? `demo clock ${t.transit.clockText}` : t.transit.realtimeOk ? "PRT live" : "timetable only"}
          </span>
        </div>

        {t.bus ? (
          <a href={t.bus.mapHref} className="group mt-2 block rounded-xl transition hover:bg-zinc-50">
            <div className="text-xs text-zinc-500">{t.bus.from} → {t.bus.to} · {t.bus.why}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">{t.bus.leaveByText}</span>
              <span className="text-sm text-zinc-500">leave by</span>
            </div>

            {t.bus.verdict && (
              <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white ${!t.bus.verdict.makesIt ? "bg-red-500" : t.bus.verdict.marginMin < 5 ? "bg-amber-500" : "bg-emerald-600"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                {t.bus.verdict.makesIt ? `you make ${t.bus.classAtText} with ${t.bus.verdict.marginMin} min to spare` : `${Math.abs(t.bus.verdict.marginMin)} min late for ${t.bus.classAtText}`}
              </div>
            )}

            <ol className="mt-3 space-y-1 text-xs text-zinc-600">
              <li className="flex gap-2"><span className="w-4">🚶</span><span className="w-10 tabular-nums text-zinc-400">{t.bus.walkToStop}m</span><span className="truncate">to {t.bus.stopName.toLowerCase()}</span></li>
              <li className="flex gap-2"><span className="w-4">🚌</span><span className="w-10 tabular-nums text-zinc-400">{t.bus.departsText}</span>
                <span className="truncate">
                  <b>{t.bus.route}</b>
                  {t.bus.live && <span className="ml-1 text-emerald-700">live{t.bus.delaySec && Math.abs(t.bus.delaySec) > 59 ? `, ${Math.abs(Math.round(t.bus.delaySec / 60))} min ${t.bus.delaySec > 0 ? "late" : "early"}` : ""}</span>}
                  {t.bus.ghost && <span className="ml-1 text-amber-700">not on the live feed</span>}
                  {t.bus.vehicleKm !== null && <span className="ml-1 text-zinc-400">· {t.bus.vehicleKm} km out</span>}
                </span>
              </li>
              <li className="flex gap-2"><span className="w-4">🪑</span><span className="w-10 tabular-nums text-zinc-400">{t.bus.rideMinutes}m</span><span className="truncate">to {t.bus.alightName.toLowerCase()}</span></li>
              <li className="flex gap-2"><span className="w-4">🚶</span><span className="w-10 tabular-nums text-zinc-400">{t.bus.walkToDest}m</span><span>to {t.bus.to}</span></li>
              <li className="flex gap-2 font-medium text-zinc-800"><span className="w-4">🎓</span><span className="w-10 tabular-nums">{t.bus.arrivalText}</span><span>arrive</span></li>
            </ol>

            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-zinc-500 group-hover:text-zinc-900">
              Open the map <span className="transition group-hover:translate-x-0.5">›</span>
            </div>
          </a>
        ) : (
          <div className="mt-2 text-sm text-zinc-500">No bus leg right now. Everything today is a walk.</div>
        )}

        {t.arrivals.length > 1 && (
          <ul className="mt-3 border-t pt-2 text-xs text-zinc-500">
            {t.arrivals.slice(1).map((a) => (
              <li key={a.route + a.text} className={`flex justify-between ${a.status === "ghost" ? "line-through opacity-60" : ""}`}>
                <span>{a.route} {a.text}{a.status === "live" ? " · live" : ""}</span>
                <span className="text-zinc-400">leave {a.leaveByText}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border p-5 md:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Gaps and quests</h2>
          <button disabled={busy} onClick={plan} className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50">{busy ? "Thinking…" : "Plan my day"}</button>
        </div>
        {narration && <p className="mt-2 text-sm italic text-zinc-600">{narration}</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {t.gaps.map((g) => (
            <div key={g.id} className="rounded-xl bg-zinc-50 p-4">
              <div className="text-lg font-semibold">{g.startText} → {g.endText}</div>
              <div className="text-xs text-zinc-500">{g.usable} usable min · from {g.fromPlace}{g.isEvening ? " · evening" : ""}</div>
              {g.pick ? (
                <div className="mt-2 flex items-center justify-between text-sm"><span>{g.pick.title}</span><button onClick={() => complete(g.pick!.id, g.pick!.estimateMinutes)} className="rounded-full border px-3 py-1 text-xs">Done</button></div>
              ) : <div className="mt-2 text-sm text-zinc-500">Nothing fits. Enjoy it.</div>}
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-sm">{t.quests.map((q) => <li key={q.id} className="flex justify-between"><span>{q.title}</span><span className="text-amber-700">+{q.xp} XP · by {q.expiresText}</span></li>)}</ul>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-sm font-medium text-zinc-500">Free with you</h2>
        {t.shared.length ? t.shared.map((w) => <div key={w.startText + w.names.join()} className="mt-2 text-sm"><b>{w.names.join(" & ")}</b> · {w.startText}–{w.endText} ({w.minutes} min)</div>) : <div className="mt-2 text-sm text-zinc-500">No overlaps today.</div>}
        <h2 className="mt-5 text-sm font-medium text-zinc-500">Tower A this week</h2>
        <ol className="mt-2 text-sm">{board.map((r) => <li key={r.name} className="flex justify-between"><span>{r.rank}. {r.name}</span><span>{r.xpWeek} XP · {r.streakWeeks}wk</span></li>)}</ol>
      </section>

      <section className="rounded-2xl border p-5 md:col-span-2">
        <h2 className="text-sm font-medium text-zinc-500">Proposals (the agent proposes, you decide)</h2>
        <ul className="mt-2 space-y-2">
          {t.proposals.filter((p) => p.status === "pending").map((p) => (
            <li key={p.id} className="rounded-xl bg-zinc-50 p-3 text-sm">
              <div className="font-medium">{p.proposal.kind.replace("_", " ")}{p.proposal.building ? ` · ${p.proposal.building}` : ""}{p.proposal.to ? ` · to ${p.proposal.to}` : ""}</div>
              <div className="text-zinc-600">{p.proposal.reason}</div>
              {p.proposal.body && <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-xs">{p.proposal.body}</pre>}
              {p.proposal.message && <div className="mt-1 text-xs">“{p.proposal.message}”</div>}
              <div className="mt-2 flex gap-2"><button onClick={() => decide(p.id, "approve")} className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white">Approve</button><button onClick={() => decide(p.id, "decline")} className="rounded-full border px-3 py-1 text-xs">Decline</button></div>
            </li>
          ))}
          {t.proposals.filter((p) => p.status === "pending").length === 0 && <li className="text-sm text-zinc-500">Nothing pending. Hit “Plan my day”.</li>}
        </ul>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-sm font-medium text-zinc-500">Calibration</h2>
        <ul className="mt-2 text-sm">{t.calibration.map((c) => <li key={c.key}>{c.key.replace("::", " · ")}: ×{c.multiplier.toFixed(2)} ({c.samples} sessions)</li>)}</ul>
        <h2 className="mt-5 text-sm font-medium text-zinc-500">Timeline</h2>
        <ul className="mt-2 max-h-48 overflow-auto text-xs text-zinc-600">{t.events.map((e) => <li key={e.seq}>{new Date(e.ts).toLocaleTimeString()} · {e.actor} · {e.type}</li>)}</ul>
      </section>

      <section className="rounded-2xl border p-5 md:col-span-3">
        <h2 className="text-sm font-medium text-zinc-500">Bring your own calendar</h2>
        <p className="mt-1 text-xs text-zinc-500">Paste the .ics links from your timetable and from Canvas. Links are fetched by the server and only https is accepted.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input value={timetableUrl} onChange={(e) => setTimetableUrl(e.target.value)} placeholder="Timetable .ics link" aria-label="Timetable .ics link" className="rounded-xl border px-3 py-2 text-sm" />
          <input value={canvasUrl} onChange={(e) => setCanvasUrl(e.target.value)} placeholder="Canvas calendar .ics link" aria-label="Canvas calendar .ics link" className="rounded-xl border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={importing || (!timetableUrl.trim() && !canvasUrl.trim())} onClick={() => importCalendars(false)} className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50">{importing ? "Importing…" : "Import"}</button>
            <button disabled={importing} onClick={() => importCalendars(true)} className="rounded-full border px-4 py-1.5 text-sm disabled:opacity-50">Use sample data</button>
          </div>
        </div>
        {importNote && <p className="mt-2 text-sm text-zinc-600">{importNote}</p>}
      </section>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
