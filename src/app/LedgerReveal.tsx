"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Beat one of the demo. The calendar's number is on screen, then it is taken
 * apart: the walk between buildings, the meals, the getting settled. The
 * counter falls to the real number while each deduction lands under it.
 *
 * Everything animated here is already computed and tested in src/core/ledger.ts.
 * This only reveals it, so a failed animation can never change a number.
 */
export interface LedgerNumbers {
  naiveFree: number;
  usable: number;
  travel: number;
  meals: number;
  routines: number;
  queued: number;
  slack: number;
  overCommitted: boolean;
}

// Sign is carried once, in front. Formatting the parts separately reads an
// over-committed day back as "-3h -45m", which is not a duration.
const hm = (m: number) => {
  const a = Math.abs(Math.round(m));
  return `${m < 0 ? "-" : ""}${Math.floor(a / 60)}h ${String(a % 60).padStart(2, "0")}m`;
};
const STEP_MS = 900;

export default function LedgerReveal({ l, onReplay }: { l: LedgerNumbers; onReplay?: () => void }) {
  const steps = [
    { key: "travel", label: "walking between buildings", minutes: l.travel },
    { key: "meals", label: "eating", minutes: l.meals },
    { key: "routines", label: "getting up and winding down", minutes: l.routines },
  ].filter((s) => s.minutes > 0);

  const [shown, setShown] = useState(0); // how many deductions have landed
  const [display, setDisplay] = useState(l.naiveFree);
  const raf = useRef<number | undefined>(undefined);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const run = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (reduced.current) { setShown(steps.length); setDisplay(l.usable); return; }
    setShown(0);
    setDisplay(l.naiveFree);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let from = l.naiveFree;
    steps.forEach((s, i) => {
      const target = from - s.minutes;
      const start = from;
      from = target;
      timers.push(setTimeout(() => {
        setShown(i + 1);
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / 650);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(Math.round(start + (target - start) * eased));
          if (p < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }, 700 + i * STEP_MS));
    });
    return () => timers.forEach(clearTimeout);
  }, [l.naiveFree, l.usable, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cleanup = run();
    return () => { cleanup?.(); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [run]);

  const done = shown >= steps.length;
  const lost = l.naiveFree - l.usable;

  return (
    <section className="relative overflow-hidden rounded-2xl border p-5 md:col-span-2">
      <div className="flex items-start justify-between">
        <h2 className="text-sm font-medium text-zinc-500">The honest ledger</h2>
        <button
          onClick={() => { run(); onReplay?.(); }}
          className="rounded-full border px-3 py-1 text-xs text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-800"
        >
          replay
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className={`text-5xl font-semibold tabular-nums tracking-tight transition-colors duration-500 ${done ? "text-emerald-700" : "text-zinc-900"}`}>
            {hm(display)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {done ? "what you actually have" : "counting what nobody counts"}
          </div>
        </div>

        <div className={`transition-opacity duration-500 ${shown > 0 ? "opacity-100" : "opacity-40"}`}>
          <div className="text-2xl text-zinc-400 line-through tabular-nums">{hm(l.naiveFree)}</div>
          <div className="mt-1 text-xs text-zinc-500">what your calendar claims</div>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-center gap-3 text-sm transition-all duration-500 ${i < shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            <span className="w-14 text-right font-medium tabular-nums text-red-600">-{s.minutes}</span>
            <span className="text-zinc-600">{s.label}</span>
          </li>
        ))}
        <li className={`flex items-center gap-3 border-t pt-2 text-sm transition-opacity duration-700 ${done ? "opacity-100" : "opacity-0"}`}>
          <span className="w-14 text-right font-semibold tabular-nums">{lost}</span>
          <span className="text-zinc-600">minutes your calendar never showed you</span>
        </li>
      </ul>

      <div className={`mt-3 text-sm transition-opacity duration-700 ${done ? "opacity-100" : "opacity-0"} ${l.overCommitted ? "text-red-600" : "text-emerald-700"}`}>
        {l.queued} min of work queued · {l.overCommitted ? `${Math.abs(l.slack)} min more than you have` : `${l.slack} min of slack, you fit`}
      </div>
    </section>
  );
}
