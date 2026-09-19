"use client";

import { useEffect, useState } from "react";

type Insight = { kind: string; text: string; suggestion: string; source: "nemotron" | "rules" };
type Habits = {
  sessions: number;
  activeDays: number;
  syntheticShare: number;
  stats: Record<string, number | string>;
  insights: Insight[];
  provider: string;
  model?: string;
  latencyMs: number;
  rejected: number;
};

const BUCKETS = [
  { key: "morning", label: "Before noon" },
  { key: "midday", label: "Noon to 5" },
  { key: "evening", label: "5 to 10 PM" },
  { key: "late", label: "After 10" },
];

/**
 * "Your patterns": what the student's own history says about how they work,
 * plus up to three suggestions. The code-written version shows immediately; the
 * Nemotron-worded version replaces it if and when it arrives, so a slow model
 * never blocks the Today screen.
 */
export default function HabitsCard({ refreshKey }: { refreshKey?: number }) {
  const [h, setH] = useState<Habits | null>(null);
  const [upgraded, setUpgraded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rules: Habits = await fetch("/api/habits?source=rules").then((r) => r.json());
        if (!alive) return;
        setH(rules);
        setUpgraded(false);
        const full: Habits = await fetch("/api/habits").then((r) => r.json());
        if (alive && full.provider === "nemotron-hosted") { setH(full); setUpgraded(true); }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  if (failed) return <section className="rounded-2xl border p-5"><h2 className="text-sm font-medium text-zinc-500">Your patterns</h2><p className="mt-2 text-sm text-zinc-500">Could not read your history right now.</p></section>;
  if (!h) return <section className="rounded-2xl border p-5"><h2 className="text-sm font-medium text-zinc-500">Your patterns</h2><p className="mt-2 text-sm text-zinc-400">Reading your history…</p></section>;

  const paces = BUCKETS.flatMap((b) => {
    const pace = h.stats[`bucket.${b.key}.pace`], n = h.stats[`bucket.${b.key}.sessions`];
    return typeof pace === "number" && typeof n === "number" ? [{ ...b, pace, n }] : [];
  });

  return (
    <section className="rounded-2xl border p-5 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-500">Your patterns</h2>
        <span className="text-xs text-zinc-400">
          {h.sessions} sessions over {h.activeDays} days{h.syntheticShare > 0.5 ? " · demo history" : ""} · {upgraded ? `worded by Nemotron (${(h.latencyMs / 1000).toFixed(1)} s)` : "written by rules"}
        </span>
      </div>

      {h.insights.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Finish a few tasks and Orbit will start noticing when you work best.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {h.insights.map((i) => (
            <li key={i.kind} className="rounded-xl bg-zinc-500/10 p-3">
              <div className="text-sm font-medium">{i.text}</div>
              <div className="mt-0.5 text-sm text-zinc-500">{i.suggestion}</div>
            </li>
          ))}
        </ul>
      )}

      {paces.length > 1 && (
        <div className="mt-4">
          <div className="text-xs text-zinc-500">Pace by time of day <span className="text-zinc-400">(1.0 = your usual pace for the same kind of task; lower is faster)</span></div>
          <ul className="mt-2 space-y-1.5">
            {paces.map((p) => (
              <li key={p.key} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-zinc-500">{p.label}</span>
                <span className="relative h-2 flex-1 rounded-full bg-zinc-500/20" aria-hidden>
                  <span className={`absolute inset-y-0 left-0 rounded-full ${p.pace < 1 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, (p.pace / 1.6) * 100)}%` }} />
                  <span className="absolute inset-y-0 w-px bg-zinc-400" style={{ left: `${(1 / 1.6) * 100}%` }} />
                </span>
                <span className="w-32 shrink-0 whitespace-nowrap text-right tabular-nums text-zinc-500">{p.pace.toFixed(2)} · {p.n} sessions</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
