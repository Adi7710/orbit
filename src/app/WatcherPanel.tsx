"use client";

import { useCallback, useEffect, useState } from "react";

type Trace = {
  seq: number;
  at: string;
  event: { kind: string; headline: string; evidence: string };
  tier: "A" | "B";
  action: string;
  reasoning: string;
  applied: boolean;
  proposalId?: string;
  score?: number;
  scores?: { grounded: number; tierCorrect: number; useful: number; voice: number };
  verdict?: "keep" | "demote" | "suppress";
  critique?: string;
  judgedBy?: string;
};
type Kind = { kind: string; n: number; mean: number; grounded: number; tierCorrect: number; useful: number; voice: number; muted: boolean };
type Status = { state: "running" | "paused" | "killed"; ticks: number; lastTickText?: string; trace: Trace[]; watching: string[]; fired?: Trace[] };

/**
 * The Watcher, made visible. A judge should be able to cancel a class and see
 * the afternoon reorganise itself, with the reason for every move.
 */
export default function WatcherPanel({ onChange }: { onChange?: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState<number[]>([]);
  const [ledger, setLedger] = useState<Kind[]>([]);
  const [showLedger, setShowLedger] = useState(false);

  const tick = useCallback(async (action?: string) => {
    const r = await fetch("/api/watcher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action ?? "tick" }),
    }).then((x) => x.json());
    setS(r);
    fetch("/api/critic").then((x) => x.json()).then((l) => setLedger(l.kinds ?? [])).catch(() => {});
    if (r.fired?.length) {
      setFlash(r.fired.map((f: Trace) => f.seq));
      setTimeout(() => setFlash([]), 4000);
      onChange?.();
    }
    return r;
  }, [onChange]);

  // Heartbeat. The Watcher is server-side; this just gives it a pulse while
  // someone is looking, and a cron could do the same when nobody is.
  useEffect(() => {
    tick();
    const id = setInterval(() => tick(), 6000);
    return () => clearInterval(id);
  }, [tick]);

  const demo = async (action: string) => {
    setBusy(action);
    await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    await tick();
    onChange?.();
    setBusy("");
  };

  if (!s) return null;
  const dot = s.state === "running" ? "bg-build" : s.state === "paused" ? "bg-warn" : "bg-line";

  return (
    <section className="rounded-2xl border p-5 md:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot} ${s.state === "running" ? "animate-pulse" : ""}`} />
          <h2 className="text-sm font-medium text-ink">
            The Watcher{" "}
            <span className="font-normal text-ink-2">
              {s.state === "running" ? `is watching · ${s.ticks} checks` : s.state === "paused" ? "is paused" : "is off"}
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="hidden text-ink-2 sm:inline">{s.lastTickText}</span>
          {s.state === "running" ? (
            <button onClick={() => tick("pause")} className="min-h-11 rounded-full border px-4 hover:border-line">Pause</button>
          ) : (
            <button onClick={() => tick("resume")} className="min-h-11 rounded-full border px-4 hover:border-line">Resume</button>
          )}
          <button onClick={() => tick("kill")} className="min-h-11 rounded-full border border-danger px-4 text-danger hover:bg-danger/10">Kill</button>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-2">
        Watching {s.watching.join(" · ")}. It changes your own screen on its own and asks before anything leaves the app.
        Every decision is graded by a second model before you see it, and that grader can only ever make it quieter.
      </p>

      {ledger.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowLedger((v) => !v)} aria-expanded={showLedger} className="min-h-11 text-left text-xs font-medium text-ink-2 hover:text-ink">
            {showLedger ? "Hide" : "Show"} how its behaviours are scoring ({ledger.length})
          </button>
          {showLedger && (
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-ink-2">
                <tr><th className="py-1 font-normal">behaviour</th><th className="font-normal">seen</th><th className="font-normal">score</th><th className="font-normal">grounded</th><th className="font-normal">right to ask</th><th className="font-normal">useful</th><th className="font-normal">voice</th></tr>
              </thead>
              <tbody>
                {ledger.map((k) => (
                  <tr key={k.kind} className={k.muted ? "text-ink-2 line-through" : ""}>
                    <td className="py-0.5">{k.kind.replace(/_/g, " ")}{k.muted && <span className="ml-1 no-underline">muted</span>}</td>
                    <td className="tabular-nums">{k.n}</td>
                    <td className={`tabular-nums font-medium ${k.mean < 2.5 ? "text-danger" : k.mean < 3.5 ? "text-warn" : "text-build"}`}>{k.mean}</td>
                    <td className="tabular-nums">{k.grounded}</td><td className="tabular-nums">{k.tierCorrect}</td><td className="tabular-nums">{k.useful}</td><td className="tabular-nums">{k.voice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => demo("cancel_class")} className="min-h-11 rounded-full bg-primary px-4 text-xs text-white disabled:opacity-50">
          {busy === "cancel_class" ? "…" : "Cancel a class"}
        </button>
        <button disabled={!!busy} onClick={() => demo("overload")} className="min-h-11 rounded-full border px-4 text-xs hover:border-line">
          {busy === "overload" ? "…" : "Drop a 7-hour deliverable on me"}
        </button>
        <button disabled={!!busy} onClick={() => demo("restore")} className="min-h-11 rounded-full border px-4 text-xs text-ink-2 hover:border-line">
          Put it back
        </button>
      </div>

      {s.trace.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Nothing has changed since it started looking.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {s.trace.map((t) => (
            <li
              key={t.seq}
              className={`rounded-xl border p-3 transition-colors duration-1000 ${flash.includes(t.seq) ? "border-warn bg-warn/10" : "border-line bg-surface/60"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.tier === "A" ? "bg-surface-2 text-ink" : "bg-warn/10 text-warn"}`}>
                  {t.tier === "A" ? "ACTED" : "ASKING"}
                </span>
                <span className="text-sm font-medium text-ink">{t.event.headline}</span>
                {t.score !== undefined && (
                  <span
                    title={t.scores ? `grounded ${t.scores.grounded}/5 · right to ask ${t.scores.tierCorrect}/5 · useful ${t.scores.useful}/5 · voice ${t.scores.voice}/5 · judged by ${t.judgedBy}` : ""}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.verdict === "suppress" ? "bg-danger/10 text-danger" : t.verdict === "demote" ? "bg-surface-2 text-ink-2" : "bg-build/10 text-build"}`}
                  >
                    {t.score}/5
                  </span>
                )}
                <span className="ml-auto text-[10px] text-ink-2">{new Date(t.at).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1.5 grid gap-1 text-xs text-ink-2 sm:grid-cols-[auto_1fr] sm:gap-x-3">
                <span className="text-ink-2">noticed</span><span>{t.event.evidence}</span>
                <span className="text-ink-2">did</span><span className="font-medium text-ink">{t.action}</span>
                <span className="text-ink-2">because</span><span>{t.reasoning}</span>
              </div>
              {t.critique && t.critique !== "checked without a model" && (
                <div className="mt-1 text-xs text-ink-2">grader: {t.critique}</div>
              )}
              {t.verdict === "suppress" ? (
                <div className="mt-1.5 text-xs font-medium text-danger">Held back: it did not pass the grader, so you were never shown it.</div>
              ) : (
                !t.applied && t.tier === "B" && <div className="mt-1.5 text-xs font-medium text-warn">Waiting for you in Proposals below.</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
