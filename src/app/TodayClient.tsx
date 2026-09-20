"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LedgerReveal from "./LedgerReveal";
import WatcherPanel from "./WatcherPanel";
import VoiceButton from "./VoiceButton";
import EmailModal from "./EmailModal";
import PulseBanner from "./PulseBanner";

type Today = {
  mode: "normal" | "crisis" | "chill";
  modeConfig: { id: string; name: string; difficulty: string; promise: string; minUsableGap: number; questsOptional: boolean; questStrategy: string; deadlineMode: "quiet-line" | "due-soon-card" | "drive-day"; feasibilityMode: "off" | "suggest-on-shortfall" | "always"; leaveBy: string; restBreakPerMin: number | null; wrapUp: string };
  stats: { minUsableGap: number; windows: number; windowMinutes: number; placed: number; placedMinutes: number; deadlinesInHorizon: number; workBlocks: number; workBlockMinutes: number; meterShown: boolean; restBreaksEarned: number; awardsXP: boolean } | null;
  wrapUpText: string;
  deadlines: { id: string; title: string; due: number; dueText: string; overdue: boolean; remainingEffortMin: number; courseCode?: string }[];
  workBlocks: { deadlineId: string; title: string; gapId: string; minutes: number; startText: string; endText: string; completes: boolean }[];
  feasibility: { needMin: number; haveMin: number; shortfallMin: number; message: string; deadlines: { id: string; title: string; fits: boolean; slackMin: number }[] } | null;
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
  opportunities?: { opportunity: { id: string; name: string; kind: string; where: string; hours: number; url: string }; inDays: number; fit: number; reason: string }[];
  growth?: string[];
  learned?: { aspect: string; label: string; sentence: string; learnedBy?: string; memo?: string }[];
  calibration: { key: string; samples: number; multiplier: number }[];
  proposals: { id: string; status: string; proposal: { kind: string; reason: string; body?: string; to?: string; subject?: string; courseCode?: string; building?: string; message?: string } }[];
  events: { seq: number; ts: string; actor: string; type: string; payload: unknown }[];
};

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
  const [actionError, setActionError] = useState("");
  const [boardError, setBoardError] = useState(false);
  // Which task is being logged, and the minutes typed so far. `window.prompt`
  // used to ask this: a native dialog that blocks the page, cannot be styled,
  // is refused outright in some embedded browsers, and -- the reason it had to
  // go -- is silently suppressed for the rest of the session once anyone ticks
  // "prevent this page from creating additional dialogs". After that the Done
  // button looks alive and does nothing, which is how a demo dies quietly.
  const [logging, setLogging] = useState<{ taskId: string; minutes: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      setBoard((await get("/api/leaderboard")).rows);
      setBoardError(false);
    } catch {
      // The board is decoration and the day is not, so this never blocks the
      // screen -- but an empty list under a heading reads as "nobody has any
      // XP", which is a different and wrong statement.
      setBoardError(true);
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

  const say = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /**
   * Every one of these used to be a bare await with no catch. A rejected fetch
   * -- Nemotron returning a 429, the tunnel dropping, the dev server
   * restarting -- threw past the setBusy(false) and left "Plan my day" reading
   * "Thinking…" and disabled for the rest of the session, with nothing on
   * screen to say why. That is demo beat two, so it fails loudly now.
   */
  const call = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return r.json();
  };
  const post = (url: string, body?: unknown) =>
    call(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

  const plan = async () => {
    setBusy(true);
    setActionError("");
    try {
      const r = await post("/api/plan");
      setNarration(`${r.narration} (${r.provider})`);
    } catch (e) {
      setActionError(`Could not plan your day: ${e instanceof Error ? e.message : String(e)}. Try again.`);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const decide = async (id: string, decision: "approve" | "decline") => {
    setActionError("");
    try {
      const r = await post(`/api/proposals/${id}`, { decision });
      if (r.effect) say(r.effect);
    } catch (e) {
      setActionError(`Could not ${decision} that proposal: ${e instanceof Error ? e.message : String(e)}`);
    }
    refresh();
  };

  const complete = async (taskId: string, minutes: string) => {
    const actual = Math.round(Number(minutes));
    // A typo used to reach the estimator as NaN and poison the calibration
    // multiplier that beat four is built on showing moving.
    if (!Number.isFinite(actual) || actual <= 0 || actual > 24 * 60) {
      setActionError("Minutes has to be a number between 1 and 1440.");
      return;
    }
    setActionError("");
    setLogging(null);
    try {
      const r = await post("/api/complete", { taskId, actualMinutes: actual });
      if (r.ok) say(`+${r.xp} XP: ${r.reasons.join(", ")}`);
    } catch (e) {
      setActionError(`Could not log that: ${e instanceof Error ? e.message : String(e)}`);
    }
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
    setActionError("");
    try {
      await post("/api/mode", { mode });
    } catch (e) {
      setActionError(`Could not switch to ${mode} mode: ${e instanceof Error ? e.message : String(e)}`);
    }
    refresh();
  };

  if (!t)
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-8">
        {loadError ? (
          <>
            <h1 className="text-lg font-semibold">Could not load your day</h1>
            <p className="mt-2 text-sm text-ink-2">{loadError}</p>
            <button onClick={refresh} className="mt-4 min-h-11 rounded-full bg-primary px-4 text-sm text-white">Try again</button>
          </>
        ) : (
          <p className="text-ink-2">Loading your day…</p>
        )}
      </main>
    );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-4 [&>section]:min-w-0 sm:p-8 md:grid-cols-3">
      <PulseBanner />
      <header className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hey {t.user.name}! Welcome to your Orbit
          </h1>
          <p className="text-sm text-ink-2">Your calendar lies about how much time you have. Orbit doesn&apos;t.</p>
          <p className="mt-1 text-sm break-words text-ink-2">
            <span className="font-medium">{t.modeConfig.name}</span>
            <span className="text-ink-2"> · {t.modeConfig.difficulty} · {t.modeConfig.promise}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {(["normal", "crisis", "chill"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={t.mode === m} title={t.mode === m ? t.modeConfig.promise : undefined} className={`min-h-11 rounded-full border px-4 ${t.mode === m ? "border-primary bg-primary text-white" : "border-line"}`}>{m}</button>
          ))}
          <span className="ml-3 rounded-full bg-surface px-3 py-1 font-medium text-ink tabular">{t.user.xpWeek} XP · {t.user.streakWeeks}-wk streak</span>
        </div>
      </header>

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-4 py-2 text-sm break-words text-danger md:col-span-3">
          {actionError}
        </p>
      )}

      <EmailModal
        pending={t.proposals.find((p) => p.status === "pending" && p.proposal.kind === "send_email") as never}
        onDone={refresh}
      />

      <VoiceButton onChange={refresh} voiceActive={setVoiceLive} />

      <WatcherPanel onChange={refresh} />

      <LedgerReveal l={t.ledger} />

      {/* Need versus have. Chill never shows it; Normal only when the day does
          not fit; Crisis always, because in Crisis it is the question. */}
      {t.feasibility && (t.modeConfig.feasibilityMode === "always" || (t.modeConfig.feasibilityMode === "suggest-on-shortfall" && t.feasibility.shortfallMin > 0)) && (
        <section className={`rounded-2xl border p-5 md:col-span-1 ${t.feasibility.shortfallMin > 0 ? "border-danger bg-danger/10" : ""}`}>
          <h2 className="text-sm font-medium text-ink-2">Will it fit?</h2>
          <p className={`mt-2 text-sm break-words ${t.feasibility.shortfallMin > 0 ? "text-danger" : "text-build"}`}>{t.feasibility.message}</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${t.feasibility.needMin} minutes of work against ${t.feasibility.haveMin} minutes of windows`}>
            <div
              className={`h-full rounded-full ${t.feasibility.shortfallMin > 0 ? "bg-danger" : "bg-build"}`}
              style={{ width: `${Math.min(100, t.feasibility.haveMin ? (t.feasibility.needMin / t.feasibility.haveMin) * 100 : 0)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-2 tabular-nums">{t.feasibility.needMin} min of work · {t.feasibility.haveMin} min of windows before the last deadline</p>
        </section>
      )}

      {t.deadlines.length > 0 && t.modeConfig.deadlineMode !== "quiet-line" && (
        <section className={`rounded-2xl border p-5 ${t.modeConfig.deadlineMode === "drive-day" ? "md:col-span-2" : ""}`}>
          <h2 className="text-sm font-medium text-ink-2">
            {t.modeConfig.deadlineMode === "drive-day" ? "What is due, tightest first" : "Due soon"}
          </h2>
          <ol className="mt-2 space-y-1.5 text-sm">
            {t.deadlines.map((d) => {
              const v = t.feasibility?.deadlines.find((x) => x.id === d.id);
              return (
                <li key={d.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words">
                    {d.courseCode && <span className="mr-1.5 text-xs text-ink-2">{d.courseCode}</span>}
                    {d.title}
                  </span>
                  <span className={`shrink-0 text-xs tabular-nums ${d.overdue ? "text-danger" : v && !v.fits ? "text-danger" : "text-ink-2"}`}>
                    {d.remainingEffortMin} min · due {d.dueText}
                    {v && !v.fits ? ` · ${Math.abs(v.slackMin)} short` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {t.modeConfig.deadlineMode === "quiet-line" && t.deadlines.length > 0 && (
        <p className="text-sm break-words text-ink-2 md:col-span-3">
          {t.deadlines.length} thing{t.deadlines.length === 1 ? "" : "s"} due in the next three days. Nothing is on fire.
        </p>
      )}
      {t.cuts.length > 0 && (
        <section className="rounded-2xl border border-danger bg-danger/10 p-5 md:col-span-2">
          <h2 className="text-sm font-medium text-ink-2">The day will not fit. Cheapest way back:</h2>
          <ul className="mt-2 text-sm text-ink">{t.cuts.map((c) => <li key={c.task.title}>Drop <b>{c.task.title}</b> · saves {c.minutesSaved} min · {c.reason}</li>)}</ul>
        </section>
      )}

      <section className="rounded-2xl border p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-ink-2">Bus</h2>
          <span className="text-[11px] text-ink-2">
            {t.transit.simulated ? `demo clock ${t.transit.clockText}` : t.transit.realtimeOk ? "PRT live" : "timetable only"}
          </span>
        </div>

        {t.bus ? (
          <a href={t.bus.mapHref} className="group mt-2 block rounded-xl transition hover:bg-surface">
            <div className="text-xs text-ink-2">{t.bus.from} → {t.bus.to} · {t.bus.why}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">{t.bus.leaveByText}</span>
              <span className="text-sm text-ink-2">leave by</span>
            </div>

            {t.bus.verdict && (
              <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white ${!t.bus.verdict.makesIt ? "bg-danger" : t.bus.verdict.marginMin < 5 ? "bg-warn" : "bg-build"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-background/90" />
                {t.bus.verdict.makesIt ? `you make ${t.bus.classAtText} with ${t.bus.verdict.marginMin} min to spare` : `${Math.abs(t.bus.verdict.marginMin)} min late for ${t.bus.classAtText}`}
              </div>
            )}

            <ol className="mt-3 space-y-1 text-xs text-ink-2">
              <li className="flex gap-2"><span aria-hidden="true" className="w-4">🚶</span><span className="w-10 tabular-nums text-ink-2">{t.bus.walkToStop}m</span><span className="truncate">to {t.bus.stopName.toLowerCase()}</span></li>
              <li className="flex gap-2"><span aria-hidden="true" className="w-4">🚌</span><span className="w-10 tabular-nums text-ink-2">{t.bus.departsText}</span>
                <span className="truncate">
                  <b>{t.bus.route}</b>
                  {t.bus.live && <span className="ml-1 text-build">live{t.bus.delaySec && Math.abs(t.bus.delaySec) > 59 ? `, ${Math.abs(Math.round(t.bus.delaySec / 60))} min ${t.bus.delaySec > 0 ? "late" : "early"}` : ""}</span>}
                  {t.bus.ghost && <span className="ml-1 text-ink-2">not on the live feed</span>}
                  {t.bus.vehicleKm !== null && <span className="ml-1 text-ink-3">· {t.bus.vehicleKm} km out</span>}
                </span>
              </li>
              <li className="flex gap-2"><span aria-hidden="true" className="w-4">🪑</span><span className="w-10 tabular-nums text-ink-2">{t.bus.rideMinutes}m</span><span className="truncate">to {t.bus.alightName.toLowerCase()}</span></li>
              <li className="flex gap-2"><span aria-hidden="true" className="w-4">🚶</span><span className="w-10 tabular-nums text-ink-2">{t.bus.walkToDest}m</span><span>to {t.bus.to}</span></li>
              <li className="flex gap-2 font-medium text-ink"><span aria-hidden="true" className="w-4">🎓</span><span className="w-10 tabular-nums">{t.bus.arrivalText}</span><span>arrive</span></li>
            </ol>

            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-2 group-hover:text-ink">
              Open the map <span className="transition group-hover:translate-x-0.5">›</span>
            </div>
          </a>
        ) : (
          <div className="mt-2 text-sm text-ink-2">No bus leg right now. Everything today is a walk.</div>
        )}

        {t.arrivals.length > 1 && (
          <ul className="mt-3 border-t pt-2 text-xs text-ink-2">
            {t.arrivals.slice(1).map((a) => (
              <li key={a.route + a.text} className={`flex justify-between ${a.status === "ghost" ? "line-through opacity-60" : ""}`}>
                <span>{a.route} {a.text}{a.status === "live" ? " · live" : ""}</span>
                <span className="text-ink-2">leave {a.leaveByText}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border p-5 md:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-2">
            {t.modeConfig.questStrategy === "deadline-blocks" ? "Gaps and the work that goes in them" : t.modeConfig.questsOptional ? "Gaps, and one thing if you want it" : "Gaps and quests"}
          </h2>
          <button disabled={busy} onClick={plan} className="min-h-11 shrink-0 rounded-full bg-primary px-4 text-sm text-white disabled:opacity-50">{busy ? "Thinking…" : "Plan my day"}</button>
        </div>
        {narration && <p className="mt-2 text-sm italic break-words text-ink-2">{narration}</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {t.gaps.map((g) => (
            <div key={g.id} className="rounded-xl bg-surface p-4">
              <div className="text-lg font-semibold">{g.startText} → {g.endText}</div>
              <div className="text-xs text-ink-2">{g.usable} usable min · from {g.fromPlace}{g.isEvening ? " · evening" : ""}</div>
              {t.workBlocks.filter((b) => b.gapId === g.id).map((b) => (
                <div key={b.deadlineId + b.startText} className="mt-2 rounded-lg bg-background p-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{b.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-2">{b.startText}–{b.endText}</span>
                  </div>
                  <div className="text-xs text-ink-2">{b.minutes} min{b.completes ? " · finishes it" : " · part of it"}</div>
                </div>
              ))}
              {g.pick ? (
                logging?.taskId === g.pick.id ? (
                  <form
                    className="mt-2 flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); complete(logging.taskId, logging.minutes); }}
                  >
                    <label htmlFor={`min-${g.pick.id}`} className="sr-only">Minutes {g.pick.title} actually took</label>
                    <input
                      id={`min-${g.pick.id}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      autoFocus
                      value={logging.minutes}
                      onChange={(e) => setLogging({ taskId: logging.taskId, minutes: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Escape") setLogging(null); }}
                      className="min-h-11 w-20 rounded-xl border px-2 text-sm tabular-nums"
                    />
                    <span className="text-xs text-ink-2">min it took</span>
                    <button type="submit" className="ml-auto min-h-11 rounded-full bg-primary px-4 text-xs text-white">Log</button>
                    <button type="button" onClick={() => setLogging(null)} className="min-h-11 rounded-full px-2 text-xs text-ink-2">Cancel</button>
                  </form>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">
                      {g.pick.title}
                      {t.modeConfig.questsOptional && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-2 uppercase">optional</span>}
                    </span>
                    <button
                      onClick={() => setLogging({ taskId: g.pick!.id, minutes: String(g.pick!.estimateMinutes) })}
                      className="min-h-11 shrink-0 rounded-full border px-4 text-xs"
                    >
                      Done
                    </button>
                  </div>
                )
              ) : <div className="mt-2 text-sm text-ink-2">Nothing fits. Enjoy it.</div>}
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-sm">{t.quests.map((q) => <li key={q.id} className="flex justify-between gap-3"><span className="min-w-0 break-words">{q.title}</span><span className="shrink-0 text-warn">+{q.xp} XP · by {q.expiresText}</span></li>)}</ul>
        {t.quests.length === 0 && <p className="mt-3 text-sm text-ink-2">No quests yet. They appear once the day has a plan.</p>}
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-sm font-medium text-ink-2">Free with you</h2>
        {t.shared.length ? t.shared.map((w) => <div key={w.startText + w.names.join()} className="mt-2 text-sm"><b>{w.names.join(" & ")}</b> · {w.startText}–{w.endText} ({w.minutes} min)</div>) : <div className="mt-2 text-sm text-ink-2">No overlaps today.</div>}
        <h2 className="mt-5 text-sm font-medium text-ink-2">Crew this week</h2>
        <ol className="mt-2 text-sm">{board.map((r) => <li key={r.name} className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.rank}. {r.name}</span><span className="shrink-0">{r.xpWeek} XP · {r.streakWeeks}wk</span></li>)}</ol>
        {board.length === 0 && <p className="mt-2 text-sm text-ink-2">{boardError ? "The board did not load." : "Nobody on the board yet."}</p>}
      </section>

      <section className="rounded-2xl border border-line p-5 md:col-span-2">
        <h2 className="text-sm font-medium text-ink-2">Coming up for you</h2>
        {(t.learned ?? []).length > 0 && (
          <div className="mt-2 rounded-xl border border-line p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-3">
              <span>{(t.learned ?? []).some((f) => f.learnedBy === "nemotron-hosted") ? "Nemotron has learned" : "Orbit has learned"}</span>
              {(t.learned ?? []).some((f) => f.learnedBy === "nemotron-hosted") && <span className="rounded-full bg-build px-2 py-0.5 text-white">Nemotron</span>}
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {(t.learned ?? []).map((f) => (
                <li key={f.aspect + f.sentence} className="break-words">
                  {f.sentence}
                  {f.memo && <span className="ml-2 text-xs text-ink-3">— its memo: “{f.memo}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(t.growth ?? []).length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {(t.growth ?? []).map((g) => <li key={g} className="break-words">{g}</li>)}
          </ul>
        )}
        {(t.opportunities ?? []).length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {(t.opportunities ?? []).map((r) => (
              <li key={r.opportunity.id} className="rounded-xl bg-surface p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <a href={r.opportunity.url} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">{r.opportunity.name}</a>
                  <span className="text-xs text-ink-3">{r.opportunity.kind}</span>
                </div>
                <p className="mt-1 break-words text-ink-2">{r.reason}</p>
                <p className="mt-1 text-xs text-ink-3">{r.opportunity.hours}h · fit {Math.round(r.fit * 100)}%</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-3">Nothing in the next few months. That is fine.</p>
        )}
      </section>

      <section className="rounded-2xl border p-5 md:col-span-2">
        <h2 className="text-sm font-medium text-ink-2">Proposals (the agent proposes, you decide)</h2>
        <ul className="mt-2 space-y-2">
          {t.proposals.filter((p) => p.status === "pending").map((p) => (
            <li key={p.id} className="rounded-xl bg-surface p-3 text-sm">
              <div className="font-medium">{p.proposal.kind.replace("_", " ")}{p.proposal.building ? ` · ${p.proposal.building}` : ""}{p.proposal.to ? ` · to ${p.proposal.to}` : ""}</div>
              <div className="break-words text-ink-2">{p.proposal.reason}</div>
              {p.proposal.body && <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs break-words whitespace-pre-wrap">{p.proposal.body}</pre>}
              {p.proposal.message && <div className="mt-1 text-xs break-words">“{p.proposal.message}”</div>}
              <div className="mt-2 flex gap-2"><button onClick={() => decide(p.id, "approve")} className="min-h-11 rounded-full bg-build px-4 text-xs text-white">Approve</button><button onClick={() => decide(p.id, "decline")} className="min-h-11 rounded-full border px-4 text-xs">Decline</button></div>
            </li>
          ))}
          {t.proposals.filter((p) => p.status === "pending").length === 0 && <li className="text-sm text-ink-2">Nothing pending. Hit “Plan my day”.</li>}
        </ul>
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="text-sm font-medium text-ink-2">Calibration</h2>
        <ul className="mt-2 text-sm">{t.calibration.map((c) => <li key={c.key}>{c.key.replace("::", " · ")}: ×{c.multiplier.toFixed(2)} ({c.samples} sessions)</li>)}</ul>
        <h2 className="mt-5 text-sm font-medium text-ink-2">Timeline</h2>
        <ul tabIndex={0} aria-label="Event timeline" className="mt-2 max-h-48 overflow-auto text-xs text-ink-2">{t.events.map((e) => <li key={e.seq}>{new Date(e.ts).toLocaleTimeString()} · {e.actor} · {e.type}</li>)}</ul>
      </section>

      <section className="rounded-2xl border p-5 md:col-span-3">
        <h2 className="text-sm font-medium text-ink-2">Bring your own calendar</h2>
        <p className="mt-1 text-xs text-ink-2">Paste the .ics links from your timetable and from Canvas. Links are fetched by the server and only https is accepted.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input value={timetableUrl} onChange={(e) => setTimetableUrl(e.target.value)} placeholder="Timetable .ics link" aria-label="Timetable .ics link" className="min-h-11 rounded-xl border px-3 text-sm" />
          <input value={canvasUrl} onChange={(e) => setCanvasUrl(e.target.value)} placeholder="Canvas calendar .ics link" aria-label="Canvas calendar .ics link" className="min-h-11 rounded-xl border px-3 text-sm" />
          <div className="flex gap-2">
            <button disabled={importing || (!timetableUrl.trim() && !canvasUrl.trim())} onClick={() => importCalendars(false)} className="min-h-11 rounded-full bg-primary px-4 text-sm text-white disabled:opacity-50">{importing ? "Importing…" : "Import"}</button>
            <button disabled={importing} onClick={() => importCalendars(true)} className="min-h-11 rounded-full border px-4 text-sm disabled:opacity-50">Use sample data</button>
          </div>
        </div>
        {importNote && <p className="mt-2 text-sm break-words text-ink-2">{importNote}</p>}
      </section>

      <section className="rounded-2xl border p-5 md:col-span-3">
        <h2 className="text-sm font-medium text-ink-2">Where the day went, under {t.modeConfig.name}&apos;s rules</h2>
        <p className="mt-2 text-sm break-words text-ink-2">{t.wrapUpText}</p>
        {t.stats && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-3 sm:grid-cols-4">
            <div className="flex justify-between gap-2"><dt>window floor</dt><dd className="tabular-nums text-ink-2">{t.stats.minUsableGap} min</dd></div>
            <div className="flex justify-between gap-2"><dt>real windows</dt><dd className="tabular-nums text-ink-2">{t.stats.windows} · {t.stats.windowMinutes} min</dd></div>
            <div className="flex justify-between gap-2"><dt>planned</dt><dd className="tabular-nums text-ink-2">{t.stats.placed} · {t.stats.placedMinutes} min</dd></div>
            <div className="flex justify-between gap-2"><dt>due in horizon</dt><dd className="tabular-nums text-ink-2">{t.stats.deadlinesInHorizon}</dd></div>
            <div className="flex justify-between gap-2"><dt>work blocks</dt><dd className="tabular-nums text-ink-2">{t.stats.workBlocks} · {t.stats.workBlockMinutes} min</dd></div>
            <div className="flex justify-between gap-2"><dt>meter</dt><dd className="text-ink-2">{t.stats.meterShown ? "shown" : "hidden"}</dd></div>
            <div className="flex justify-between gap-2"><dt>recovery breaks</dt><dd className="tabular-nums text-ink-2">{t.stats.restBreaksEarned}</dd></div>
            <div className="flex justify-between gap-2"><dt>XP</dt><dd className="text-ink-2">{t.stats.awardsXP ? "awarded" : "not in this mode"}</dd></div>
          </dl>
        )}
      </section>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
