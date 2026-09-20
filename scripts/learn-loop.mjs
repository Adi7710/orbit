#!/usr/bin/env node
/**
 * Keep the learner learning.
 *
 *   node scripts/learn-loop.mjs               # every 10 minutes
 *   node scripts/learn-loop.mjs --every 300   # seconds
 *
 * Every tick: run the weekly review over whatever the store holds now (new
 * completions, new proposals decided, the day moving on), then print what
 * Orbit currently believes about the student and the one thing it is
 * pointing them at. No weights change; this is the in-context learner
 * re-reading the week. Runs beside selfeval-loop.mjs.
 */
const BASE = process.env.ORBIT_BASE ?? "http://localhost:3123";
const everyIdx = process.argv.indexOf("--every");
const EVERY_MS = (everyIdx > 0 ? Number(process.argv[everyIdx + 1]) : 600) * 1000;

async function tick() {
  const when = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" });
  try {
    const r = await fetch(`${BASE}/api/learning/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(EVERY_MS - 5000) });
    const j = await r.json();
    const p = await (await fetch(`${BASE}/api/learning/profile`)).json();
    const t = await (await fetch(`${BASE}/api/today`)).json();
    const active = p.aspects.filter((a) => a.active).map((a) => a.id);
    console.log(`${when}  week ${j.week ?? "?"}  ${p.facts.length} facts  active: ${active.join(", ") || "none"}`);
    for (const f of p.facts) console.log(`    - ${f.sentence}`);
    for (const g of t.growth ?? []) console.log(`    > ${g}`);
    if (t.opportunities?.[0]) console.log(`    * ${t.opportunities[0].reason}`);
  } catch (e) {
    console.log(`${when}  review failed: ${e.message}`);
  }
}

await tick();
setInterval(tick, EVERY_MS);
