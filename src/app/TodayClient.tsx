"use client";

import { useCallback, useEffect, useState } from "react";

type Today = {
  mode: "normal" | "crisis" | "chill";
  user: { name: string; xpWeek: number; streakWeeks: number; group: string };
  ledger: { usable: number; naiveFree: number; travel: number; meals: number; routines: number; fixed: number; queued: number; slack: number; overCommitted: boolean };
  gaps: { id: string; startText: string; endText: string; usable: number; fromPlace?: string; isEvening: boolean; pick: { id: string; title: string; estimateMinutes: number } | null }[];
  quests: { id: string; title: string; xp: number; kind: string; expiresText: string }[];
  bus: { route: string; leaveByText: string; arrivalText: string; ghost?: boolean; live?: boolean; from: string; to: string; stopName: string; walkToStop: number; rideMinutes: number; delaySec?: number } | null;
  ghosts: { route: string }[];
  arrivals: { route: string; text: string; realtime: boolean; status: "live" | "scheduled" | "ghost"; headsign: string }[];
  transit: { clockText: string; simulated: boolean; realtimeOk: boolean };
  shared: { startText: string; endText: string; minutes: number; names: string[] }[];
  tasks: { id: string; title: string; planningMinutes: number; estimateMinutes: number; courseCode?: string; dueAt?: string }[];
  cuts: { task: { title: string }; minutesSaved: number; reason: string }[];
  calibration: { key: string; samples: number; multiplier: number }[];
  proposals: { id: string; status: string; proposal: { kind: string; reason: string; body?: string; to?: string; building?: string; message?: string } }[];
  events: { seq: number; ts: string; actor: string; type: string; payload: unknown }[];
};

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export default function TodayClient() {
  const [t, setT] = useState<Today | null>(null);
  const [narration, setNarration] = useState("");
  const [board, setBoard] = useState<{ rank: number; name: string; xpWeek: number; streakWeeks: number; group?: string }[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/today").then((r) => r.json()), fetch("/api/leaderboard?group=Tower%20A").then((r) => r.json())]);
    setT(a);
    setBoard(b.rows);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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

  const setMode = async (mode: Today["mode"]) => {
    await fetch("/api/mode", { method: "POST", body: JSON.stringify({ mode }), headers: { "Content-Type": "application/json" } });
    refresh();
  };

  if (!t) return <main className="p-8 text-zinc-400">Loading your day…</main>;
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

      <section className="rounded-2xl border p-5 md:col-span-2">
        <h2 className="text-sm font-medium text-zinc-500">The honest ledger</h2>
        <div className="mt-2 flex items-end gap-6">
          <div><div className="text-4xl font-semibold">{hm(t.ledger.usable)}</div><div className="text-xs text-zinc-500">you actually have</div></div>
          <div><div className="text-2xl text-zinc-400 line-through">{hm(t.ledger.naiveFree)}</div><div className="text-xs text-zinc-500">what the calendar claims</div></div>
          <div className="text-sm text-zinc-600">The missing <b>{lost} min</b> = walking {t.ledger.travel} + meals {t.ledger.meals} + getting settled {t.ledger.routines}</div>
        </div>
        <div className={`mt-3 text-sm ${t.ledger.overCommitted ? "text-red-600" : "text-emerald-700"}`}>
          {t.ledger.queued} min queued · slack {t.ledger.slack} min {t.ledger.overCommitted ? "· over-committed" : "· you fit"}
        </div>
        {t.cuts.length > 0 && (
          <ul className="mt-2 text-sm text-zinc-600">{t.cuts.map((c) => <li key={c.task.title}>Cut <b>{c.task.title}</b> (saves {c.minutesSaved} min, {c.reason})</li>)}</ul>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-sm font-medium text-zinc-500">Bus {t.bus ? `· ${t.bus.from} → ${t.bus.to}` : ""} <span className="text-zinc-400">· PRT {t.transit.realtimeOk ? "live" : "schedule"}{t.transit.simulated ? ` · demo clock ${t.transit.clockText}` : ""}</span></h2>
        {t.bus ? (
          <div className="mt-2">
            <div className="text-2xl font-semibold">Leave by {t.bus.leaveByText}</div>
            <div className="text-sm text-zinc-600">{t.bus.route} departs {t.bus.stopName} {t.arrivals[0]?.text}{t.bus.live ? ` (live${t.bus.delaySec ? `, ${Math.round(t.bus.delaySec / 60)} min ${t.bus.delaySec > 0 ? "late" : "early"}` : ""})` : t.bus.ghost ? " (scheduled, not on the live feed)" : " (scheduled)"} · {t.bus.walkToStop} min walk · {t.bus.rideMinutes} min ride · arrive {t.bus.arrivalText}</div>
          </div>
        ) : <div className="mt-2 text-sm text-zinc-500">No bus leg today.</div>}
        <ul className="mt-3 text-xs text-zinc-500">{t.arrivals.map((a) => <li key={a.route + a.text}>{a.route} {a.text} <span className="text-zinc-400">{a.headsign.toLowerCase()}</span>{a.status === "ghost" ? <span className="text-amber-700"> · ghost</span> : a.status === "live" ? " · live" : ""}</li>)}</ul>
        {t.ghosts.length > 0 && <div className="mt-2 text-xs text-amber-700">{t.ghosts.map((g) => g.route).join(", ")} should be on the road but is not on the live feed.</div>}
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

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
