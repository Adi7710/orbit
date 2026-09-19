import { NextResponse } from "next/server";
import { ask } from "@/agents/ask";
import { judge } from "@/agents/critic";
import { QUESTION_BANK, leadsWith, satisfies, type BankQuestion } from "@/core/questionBank";
import { buildToday } from "@/lib/today";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Orbit answering its own question bank, graded.
 *
 * This is the loop that makes it stronger, and it is worth being precise about
 * what it is: **no weights change**. Nothing here trains a model. What it does
 * is turn "can Orbit answer questions" from an opinion into a number, and name
 * exactly which questions it failed, so the next change either moves that
 * number or it did not.
 *
 * Three things are scored per question, and they catch different failures:
 *
 *  - **grounded**: did every number trace to a fact? Arithmetic, not opinion.
 *  - **onTarget**: did it rest on the facts a right answer needs? An answer can
 *    be perfectly grounded and still be about the wrong thing.
 *  - **the Critic**: a second model's view of whether a person would be glad
 *    of it. Already used on Watcher decisions; reused here unchanged.
 *
 * Out-of-scope questions are scored inverted: the pass condition is a refusal.
 */

interface Row {
  id: string;
  tag: BankQuestion["tag"];
  q: string;
  answer: string;
  grounded: boolean;
  onTarget: boolean;
  led: boolean;
  refused: boolean;
  passed: boolean;
  critic?: number;
  cited: string[];
  unlicensed: number[];
  provider: string;
  repaired: boolean;
  ms: number;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tag?: string; withCritic?: boolean; limit?: number };
  const today = await buildToday();
  const bank = QUESTION_BANK.filter((b) => !body.tag || b.tag === body.tag).slice(0, body.limit ?? 100);
  const useCritic = body.withCritic !== false;

  const rows: Row[] = [];
  for (const b of bank) {
    const a = await ask(b.q, today);
    const refused = a.provider === "refused" || /I do not have anything on that|I do not know/i.test(a.text);
    const grounded = a.check.ok;
    const onTarget = satisfies(a.check.cited, b.expect);
    // The facts the answer was actually built from, in rank order. An answer
    // that mentions the right thing third has not answered the question.
    const led = leadsWith(a.because.map((x) => x.key), b.expect);

    // An out-of-scope question passes only by refusing. Everything else passes
    // by being grounded, on target, and not a refusal.
    const passed = b.mustRefuse ? refused : grounded && onTarget && led && !refused;

    let critic: number | undefined;
    if (useCritic && !b.mustRefuse) {
      const j = await judge({
        kind: "answer" as never,
        tier: "A",
        headline: b.q,
        evidence: a.because.map((x) => x.text).join(" "),
        action: a.text,
        reasoning: a.because.map((x) => x.source).join("; "),
      });
      critic = j.overall;
    }

    rows.push({
      id: b.id, tag: b.tag, q: b.q, answer: a.text,
      grounded, onTarget, led, refused, passed, critic,
      cited: a.check.cited, unlicensed: a.check.unlicensed,
      provider: a.provider, repaired: a.repaired, ms: a.latencyMs,
    });
  }

  const passed = rows.filter((r) => r.passed).length;
  const critics = rows.map((r) => r.critic).filter((x): x is number => typeof x === "number");
  const byTag: Record<string, { n: number; passed: number }> = {};
  for (const r of rows) {
    const t = (byTag[r.tag] ??= { n: 0, passed: 0 });
    t.n += 1;
    if (r.passed) t.passed += 1;
  }

  const summary = {
    at: new Date().toISOString(),
    asked: rows.length,
    passed,
    score: +((passed / Math.max(1, rows.length)) * 100).toFixed(1),
    grounded: rows.filter((r) => r.grounded).length,
    ungroundedAnswers: rows.filter((r) => !r.grounded).map((r) => r.id),
    repairedAnswers: rows.filter((r) => r.repaired).map((r) => r.id),
    offTarget: rows.filter((r) => !r.onTarget && !r.refused).map((r) => r.id),
    buriedTheAnswer: rows.filter((r) => r.onTarget && !r.led).map((r) => r.id),
    leaked: rows.filter((r) => r.tag === "outofscope" && !r.refused).map((r) => r.id),
    avgCritic: critics.length ? +(critics.reduce((a, b) => a + b, 0) / critics.length).toFixed(2) : null,
    byTag,
    avgMs: Math.round(rows.reduce((a, b) => a + b.ms, 0) / Math.max(1, rows.length)),
  };

  // Keep a history so the score is a trend, not a single reading.
  const s = store();
  s.selfEval ??= [];
  s.selfEval.unshift(summary);
  s.selfEval = s.selfEval.slice(0, 20);
  log("rules", "selfeval_run", { score: summary.score, passed, asked: rows.length });

  return NextResponse.json({ summary, failures: rows.filter((r) => !r.passed), rows, history: s.selfEval });
}

/** The trend, without re-running anything. */
export async function GET() {
  const s = store();
  return NextResponse.json({ history: s.selfEval ?? [], bank: QUESTION_BANK.length });
}
