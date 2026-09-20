"use client";

import { useEffect, useState } from "react";

/**
 * Does Nemotron help? The page a judge reads.
 *
 * Nothing here is computed on the client. `/api/eval` scores the estimator
 * three ways against the same ten sessions and is cached on the server, so
 * this page opens instantly at a table; `/api/learning/profile` is what the
 * weekly review has learned about this student; the last Plan-my-day
 * provider comes from the event log. The learner results below are the
 * measured numbers from docs/learning, stated once, with the losses left in.
 */

type Summary = {
  mae: number;
  within25pct: string;
  worstMiss: string;
  avgLatencyMs?: number;
  answeredByModel?: string;
  clampFired?: number;
  model?: string;
  cost?: string;
  note?: string;
  errors?: string[];
};
type Detail = { title: string; actual: number; predicted?: number; used?: number; baseline?: number; modelSaid?: number; clamped?: boolean; provider?: string; latencyMs?: number };
type Eval = { summary: Record<string, Summary>; detail: Record<string, Detail[]>; cachedAt?: string; note: string };
type Profile = {
  week: number;
  lastReviewedWeek: number;
  facts: { aspect: string; label: string; sentence: string }[];
  aspects: { id: string; label: string; active: boolean; observations: number; needs: number; memo: string | null; multipliers: Record<string, number> }[];
};

const ROWS: { key: string; label: string; sub: string }[] = [
  { key: "heuristic", label: "Heuristic", sub: "ten lines of title matching, no model" },
  { key: "zeroshot", label: "Nemotron, zero-shot", sub: "the prompt we shipped first" },
  { key: "anchored", label: "Nemotron, anchored + clamp", sub: "given the heuristic, clamped to 0.5x to 2x in code" },
];

const LEARNER = [
  { aspect: "Assignment length", none: "21.1 min", rules: "6.8 min", nemotron: "3.9 min", verdict: "Nemotron", note: "learns most of the pattern from one week" },
  { aspect: "Procrastination", none: "0 of 8 caught", rules: "2 of 8 caught", nemotron: "7 of 8 caught", verdict: "Nemotron", note: "blown deadlines seen a week out; 2 false alarms" },
  { aspect: "Walking speed", none: "2.0 min", rules: "0.8 min", nemotron: "1.2 min", verdict: "Code", note: "the median wins on known legs; the model gave the reason for the hill" },
  { aspect: "Exam cramming", none: "1 of 4 nights caught", rules: "4 of 4", nemotron: "4 of 4", verdict: "Code", note: "tie on outcome, worse numbers, so the average ships" },
];

const USES = [
  { job: "Plans the day", how: "second tier under Claude, first when there is no Anthropic key; move_task and book_room only; every id checked; code fills what it skips", beat: "beat 2" },
  { job: "Estimates task minutes", how: "anchored to the heuristic, clamped in the pure core; scored below", beat: "beat 5" },
  { job: "Parses syllabus PDFs", how: "Nemotron Parse, every deadline with a page and a box", beat: "Xtract" },
  { job: "Judges the other agents", how: "LLM-as-judge with a reward ledger; can lower trust, never raise it", beat: "Watcher" },
  { job: "Learns the student", how: "one week at a time, in context, with its own memo; eleven aspects, each inert until it has evidence", beat: "Today, voice" },
  { job: "Does not reword spoken answers", how: "removed: it turned “nothing to leave for” into “leave at 9:05”. Facts speak for themselves.", beat: "voice" },
];

export default function EvalClient() {
  const [ev, setEv] = useState<Eval | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lastPlan, setLastPlan] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [e, p, t] = await Promise.all([
          fetch("/api/eval", { signal: AbortSignal.timeout(300000) }).then((r) => r.json()),
          fetch("/api/learning/profile").then((r) => r.json()),
          fetch("/api/today").then((r) => r.json()),
        ]);
        setEv(e);
        setProfile(p);
        const ev = (t.events as { type: string; payload: { provider?: string } }[]).find((x) => x.type === "proposals_created");
        setLastPlan(ev?.payload?.provider ?? "");
      } catch (x) {
        setErr(x instanceof Error ? x.message : String(x));
      }
    })();
  }, []);

  const best = ev ? Math.min(...ROWS.map((r) => ev.summary[r.key]?.mae ?? Infinity)) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-ink">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">NVIDIA · Beyond the Chatbot</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Does Nemotron help?</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-2">
        We measured our own model, found it losing to ten lines of code, and fixed it with a clamp rather than pretending. The eval is the evidence, not the marketing.
      </p>

      {err && <p role="alert" className="mt-4 text-sm text-danger">{err}</p>}

      {/* 1. The three scorers */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-3">Task-minute estimation · ten sessions, same truth, three scorers</h2>
        {!ev ? (
          <p className="mt-3 text-sm text-ink-3">Scoring…</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-3 py-2">Scorer</th>
                  <th className="px-3 py-2 text-right">MAE</th>
                  <th className="px-3 py-2 text-right">Within 25%</th>
                  <th className="px-3 py-2 text-right">Answered</th>
                  <th className="px-3 py-2 text-right">Latency</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const s = ev.summary[r.key];
                  if (!s) return null;
                  const isBest = s.mae === best;
                  return (
                    <tr key={r.key} className="border-t border-line">
                      <td className="px-3 py-2">
                        <div className={isBest ? "font-semibold" : ""}>{r.label}</div>
                        <div className="text-xs text-ink-3">{r.sub}</div>
                      </td>
                      <td className={`px-3 py-2 text-right tabular ${isBest ? "font-semibold text-primary" : ""}`}>{s.mae} min</td>
                      <td className="px-3 py-2 text-right tabular">{s.within25pct}</td>
                      <td className="px-3 py-2 text-right tabular">{s.answeredByModel ?? "n/a"}</td>
                      <td className="px-3 py-2 text-right tabular">{s.avgLatencyMs ? `${(s.avgLatencyMs / 1000).toFixed(1)} s` : "0 ms"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {ev && (
          <ul className="mt-3 space-y-1 text-sm text-ink-2">
            <li>Worst miss, zero-shot: <b className="text-ink">{ev.summary.zeroshot?.worstMiss}</b>. The prompt said &ldquo;exam prep 180&ndash;360&rdquo; and nothing about quizzes.</li>
            <li>The clamp is in <code className="rounded bg-surface px-1">src/core/estimator.ts</code>, proven with no key and no network: a property test shows no model output up to 100,000 can leave the window.</li>
            {ev.summary.anchored?.errors?.length ? <li className="text-ink-3">Errors this run: {ev.summary.anchored.errors.join("; ")}</li> : null}
            {ev.cachedAt && <li className="text-xs text-ink-3">Scored {new Date(ev.cachedAt).toLocaleTimeString()} · cached so it opens instantly · model {ev.summary.anchored?.model ?? "—"}</li>}
          </ul>
        )}
      </section>

      {/* 2. Per-task bars */}
      {ev && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-ink-3">Per task · predicted against actual</h2>
          <div className="mt-3 space-y-2">
            {(ev.detail.heuristic ?? []).map((h, i) => {
              const z = ev.detail.zeroshot?.[i];
              const a = ev.detail.anchored?.[i];
              const max = Math.max(h.actual, h.predicted ?? 0, z?.used ?? 0, a?.used ?? 0, 1);
              const bar = (v: number | undefined, cls: string, label: string) =>
                v === undefined ? null : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-ink-3">{label}</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-2">
                      <div className={`h-2 rounded-full ${cls}`} style={{ width: `${Math.round((v / max) * 100)}%` }} />
                    </div>
                    <span className="w-12 text-right tabular text-ink-2">{v}</span>
                  </div>
                );
              return (
                <div key={h.title} className="rounded-lg border border-line p-3">
                  <div className="mb-1.5 text-sm">{h.title}</div>
                  {bar(h.actual, "bg-ink", "actual")}
                  {bar(h.predicted, "bg-ink-3", "heuristic")}
                  {bar(z?.used, "bg-warn", "zero-shot")}
                  {bar(a?.used, "bg-primary", "anchored")}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Learning the student */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-3">Learning the student · one week at a time, two synthetic students, one held out</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-3 py-2">Aspect</th>
                <th className="px-3 py-2 text-right">No learning</th>
                <th className="px-3 py-2 text-right">Running average</th>
                <th className="px-3 py-2 text-right">Nemotron</th>
                <th className="px-3 py-2">Ships</th>
              </tr>
            </thead>
            <tbody>
              {LEARNER.map((r) => (
                <tr key={r.aspect} className="border-t border-line">
                  <td className="px-3 py-2">
                    <div>{r.aspect}</div>
                    <div className="text-xs text-ink-3">{r.note}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-ink-2">{r.none}</td>
                  <td className="px-3 py-2 text-right tabular text-ink-2">{r.rules}</td>
                  <td className={`px-3 py-2 text-right tabular ${r.verdict === "Nemotron" ? "font-semibold text-primary" : "text-ink-2"}`}>{r.nemotron}</td>
                  <td className="px-3 py-2">{r.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-prose text-sm text-ink-2">
          In context, not weights: the model sees one week, what it planned against what happened, and a memo it wrote to itself. Code clamps and writes every sentence, because in two aspects it described its own numbers backwards. Full write-ups in <code className="rounded bg-surface px-1">docs/learning/</code>.
        </p>

        <h3 className="mt-5 text-sm font-medium text-ink-3">What it has learned about this student, live</h3>
        {!profile ? (
          <p className="mt-2 text-sm text-ink-3">Reading…</p>
        ) : profile.facts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">
            Nothing yet: the weekly review has not run on this server (week {profile.week}, last reviewed {profile.lastReviewedWeek}). It runs on the first open of Today, or <code className="rounded bg-surface px-1">POST /api/learning/review</code>.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {profile.facts.map((f) => (
              <li key={f.aspect + f.sentence} className="rounded-lg border border-line p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-ink-3">{f.label}</div>
                <div className="mt-0.5">{f.sentence}</div>
              </li>
            ))}
          </ul>
        )}
        {profile && profile.aspects.some((a) => a.active && a.memo) && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-2">The memos it wrote to itself</summary>
            <ul className="mt-2 space-y-2">
              {profile.aspects.filter((a) => a.active && a.memo).map((a) => (
                <li key={a.id} className="rounded-lg bg-surface p-3">
                  <div className="text-xs uppercase tracking-wide text-ink-3">{a.label} · {a.observations} observations</div>
                  <div className="mt-1 text-ink-2">{a.memo}</div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* 4. Where it runs */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-3">Where Nemotron runs in Orbit · none of it is chat</h2>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {USES.map((u) => (
            <li key={u.job} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              <span className="w-44 shrink-0 font-medium">{u.job}</span>
              <span className="flex-1 text-ink-2">{u.how}</span>
              <span className="shrink-0 text-xs text-ink-3">{u.beat}</span>
            </li>
          ))}
        </ul>
        {lastPlan && (
          <p className="mt-2 text-xs text-ink-3">
            Last Plan my day on this server: <code className="rounded bg-surface px-1">{lastPlan}</code>
          </p>
        )}
        <p className="mt-2 max-w-prose text-xs text-ink-3">
          Model: <code>nvidia/nemotron-3.5-lightning-30b-a3b</code>, hosted. Prompt-only, JSON extracted from the reply: with <code>response_format</code> set to a strict schema the endpoint emitted tab characters for 15 seconds; without it, 800 ms. Nothing was fine-tuned.
        </p>
      </section>
    </main>
  );
}
