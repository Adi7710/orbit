import { claude } from "./models";
import { nemotronJson } from "./models";
import { buildFactsheet, type Fact, type TodayLike } from "@/core/factsheet";
import { checkAnswer, cannotAnswer, outOfScope, type AnswerCheck } from "@/core/answerCheck";

/**
 * The Ask agent: open questions, grounded answers, and a defence for each one.
 *
 * Until now Orbit could only answer the questions someone had written a tool
 * for; anything else got "I only know your schedule, your tasks and your bus",
 * which is true and useless. This answers whatever is asked, from a factsheet
 * built out of the deterministic core, and refuses honestly when the facts do
 * not cover it.
 *
 * The order matters:
 *
 *  1. **Retrieve.** Pick the facts that bear on the question. Cheap, local.
 *  2. **Answer.** A model phrases those facts. If no key is present, the
 *     highest-scoring facts are read out directly -- still a real answer.
 *  3. **Verify.** Every number in the answer must be licensed by a fact. An
 *     unlicensed number means the answer is thrown away and the facts are
 *     stated plainly instead. The model gets to phrase, never to compute.
 *  4. **Defend.** The answer carries the fact keys and their sources, so "why
 *     do you say that?" is a lookup rather than a second opinion.
 */

export interface Answer {
  question: string;
  text: string;
  /** Fact keys behind the answer, with where each came from. */
  because: { key: string; text: string; source: string }[];
  check: AnswerCheck;
  provider: "claude" | "nemotron" | "facts" | "refused";
  /** True when a model's wording was discarded for containing a number we could not source. */
  repaired: boolean;
  latencyMs: number;
}

/** Word overlap between the question and a fact. Deliberately dumb and deterministic. */
const STOP = new Set(["what", "when", "how", "why", "does", "do", "did", "the", "a", "an", "is", "are", "my", "me", "i", "you", "to", "of", "for", "in", "on", "and", "it", "that", "this", "have", "has", "can", "should", "will", "much", "many", "long", "today"]);

export function rank(question: string, facts: Fact[]): Fact[] {
  const q = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  if (q.length === 0) return facts.slice(0, 6);
  // Crude stemming. Without it "estimates" never matches a fact that says
  // "estimate", and the question is refused outright as unanswerable.
  const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
  const Q = question.toLowerCase();

  const scored = facts.map((f) => {
    const hay = `${f.key} ${f.text}`.toLowerCase();
    let score = q.filter((w) => hay.includes(w) || hay.includes(stem(w))).length;

    // Intent nudges. Every one of these exists because a question in the bank
    // was answered from the wrong facts, not because it seemed like a good idea.
    if (/\b(free|time|hours|minutes|busy)\b/.test(Q) && f.key.startsWith("ledger")) score += 2;
    if (/\b(bus|leave|late|get there|arrive|commute)\b/.test(Q) && f.key.startsWith("bus")) score += 2;
    if (/\bestimat\w*|\b(guess|history|calibrat\w*)\b/.test(Q) && f.key.startsWith("calibration")) score += 3;
    if (/\b(window|gap|slot|stretch)\b/.test(Q) && f.key.startsWith("gap")) score += 2;
    // "longest free stretch" and "best window" are the same question, and it
    // has a dedicated fact. Without this the answer opened on window one and
    // reached the actual longest one two sentences later.
    if (/\b(longest|biggest|best|most)\b/.test(Q) && f.key === "gap.best") score += 4;
    if (/\b(drop|cut|behind|over|fit)\b/.test(Q) && (f.key.startsWith("cut") || f.key === "ledger.commitment")) score += 2;
    if (/\b(xp|points|streak)\b/.test(Q) && f.key === "xp") score += 2;
    // "What is due soonest" shares no word with any fact, so it needs its own route.
    if (/\b(due|soonest|deadline|next|upcoming|left to do)\b/.test(Q) && (f.key.startsWith("task") || f.key === "tasks.count")) score += 3;
    // "Will I make it" is the bus verdict specifically, and it was losing to
    // the ledger because "on time" tripped the time nudge.
    if (/\b(make it|on time|miss|late)\b/.test(Q) && (f.key === "bus.verdict" || f.key === "bus.noclass")) score += 5;
    // "on time" makes "time" a question word, which matches "times" in every
    // calibration fact -- that is how a question about catching a bus got
    // answered out of the estimator history, correctly but about nothing asked.
    if (/\b(make it|on time)\b/.test(Q) && (f.key.startsWith("ledger") || f.key.startsWith("calibration"))) score -= 3;
    return { f, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // No forced fallback. Padding every question with the ledger meant the
  // relevant list was never empty, so the agent never refused anything and
  // every out-of-scope question got a confident answer about the wrong thing.
  if (hits.length === 0) return [];
  const top = hits.slice(0, 7).map((x) => x.f);
  const ledger = facts.find((f) => f.key === "ledger.usable");
  if (ledger && !top.includes(ledger) && hits[0].score > 1) top.push(ledger);
  return top;
}

const SYSTEM = [
  "You answer a university student's question about their own day, using ONLY the numbered facts provided.",
  "Two or three sentences. Plain, direct, no preamble, no 'great question', no offer to help further.",
  "Every number you write must appear in the facts. Never add, round, convert or combine numbers to make a new one. If the facts do not answer the question, say so in one sentence rather than guessing.",
  "Do not repeat the facts verbatim as a list; answer the question that was actually asked.",
].join(" ");

const factBlock = (facts: Fact[]) => facts.map((f, i) => `${i + 1}. [${f.key}] ${f.text}`).join("\n");

/** When no model is reachable, the facts themselves are the answer. */
function speakFacts(facts: Fact[]): string {
  return facts.slice(0, 3).map((f) => f.text).join(" ");
}

export async function ask(question: string, today: TodayLike): Promise<Answer> {
  const started = Date.now();

  // Checked before retrieval. "Should I drop out of university" shares the word
  // "drop" with the cut suggestions and would otherwise score well enough to
  // earn a confident answer about skipping the gym.
  const refusal = outOfScope(question);
  if (refusal) {
    return { question, text: refusal, because: [], check: { ok: true, unlicensed: [], cited: [], note: "outside what Orbit can know" }, provider: "refused", repaired: false, latencyMs: Date.now() - started };
  }

  const facts = buildFactsheet(today);
  const relevant = rank(question, facts);
  const because = () => relevant.map((f) => ({ key: f.key, text: f.text, source: f.source }));

  if (relevant.length === 0) {
    return { question, text: cannotAnswer(question), because: [], check: { ok: true, unlicensed: [], cited: [], note: "no facts matched" }, provider: "refused", repaired: false, latencyMs: Date.now() - started };
  }

  const prompt = `Facts:\n${factBlock(relevant)}\n\nQuestion: ${question}`;
  let text = "";
  let provider: Answer["provider"] = "facts";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await claude().messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
      provider = "claude";
    } catch { /* fall through */ }
  }

  if (!text && process.env.NVIDIA_API_KEY) {
    const r = await nemotronJson<{ answer: string }>(
      SYSTEM + " Reply as JSON: {\"answer\": string}.",
      prompt,
      { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
      () => ({ answer: "" }),
    );
    if (r.provider !== "heuristic" && r.data.answer) { text = String(r.data.answer).trim(); provider = "nemotron"; }
  }

  if (!text) { text = speakFacts(relevant); provider = "facts"; }

  // Verify against the facts the answer was actually shown, not the whole
  // sheet. Checking against everything lets a number borrowed from an
  // unrelated fact pass: "you have 340 usable minutes" was licensed by the XP
  // fact saying 340 XP, which is exactly the confident-wrong-number failure
  // this check exists to catch.
  //
  // A model that invented a number loses its wording entirely. We do not patch
  // the sentence, because a half-corrected number is worse than a plain one.
  let check = checkAnswer(text, relevant);
  let repaired = false;
  if (!check.ok) {
    text = speakFacts(relevant);
    provider = "facts";
    repaired = true;
    check = checkAnswer(text, relevant);
  }

  return { question, text, because: because(), check, provider, repaired, latencyMs: Date.now() - started };
}
