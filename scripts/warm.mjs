#!/usr/bin/env node
/**
 * Warm the server before a judge walks up.
 *
 *   node scripts/warm.mjs                # against http://localhost:3123
 *   ORBIT_BASE=https://... node scripts/warm.mjs
 *
 * Runs, in order, the three things that are slow the first time and instant
 * after: the weekly review (so learned[] is on Today and in the voice), the
 * eval (cached ten minutes, so /eval opens at once), and one Plan my day (so
 * the model path is hot and the provider line reads nemotron-hosted). Prints
 * one line per step with what it found. Run it sixty seconds before each
 * table; nothing here changes what the demo shows, only how fast.
 */
const BASE = process.env.ORBIT_BASE ?? "http://localhost:3123";
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function step(name, fn) {
  process.stdout.write(`${name.padEnd(16)} `);
  try {
    const out = await fn();
    console.log(`ok   ${since()}  ${out}`);
  } catch (e) {
    console.log(`FAIL ${since()}  ${e.message}`);
  }
}

await step("server", async () => {
  const r = await fetch(`${BASE}/api/today`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return `usable ${j.ledger.usable} of ${j.ledger.naiveFree}, ${j.gaps.length} windows, mode ${j.mode}`;
});

await step("weekly review", async () => {
  const r = await fetch(`${BASE}/api/learning/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(600000) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  const p = await (await fetch(`${BASE}/api/learning/profile`)).json();
  return `week ${j.week}, ${p.facts.length} facts, ${p.aspects.filter((a) => a.active).length} aspects active`;
});

await step("eval", async () => {
  const r = await fetch(`${BASE}/api/eval?fresh=1`, { signal: AbortSignal.timeout(600000) });
  const j = await r.json();
  const s = j.summary;
  return `heuristic ${s.heuristic.mae} · zero-shot ${s.zeroshot.mae} (${s.zeroshot.answeredByModel}) · anchored ${s.anchored.mae} (${s.anchored.answeredByModel})`;
});

await step("plan my day", async () => {
  const r = await fetch(`${BASE}/api/plan`, { method: "POST", signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  return `${j.proposals.length} proposals · ${j.provider}`;
});

await step("voice", async () => {
  const r = await fetch(`${BASE}/api/voice/token`);
  const j = await r.json();
  return j.token ? "token mints" : `no token: ${j.reason}`;
});

console.log(`\nwarm in ${since()}. Open ${BASE}/ and ${BASE}/eval.`);
