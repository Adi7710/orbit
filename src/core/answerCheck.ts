import type { Fact } from "./factsheet";
import { licensedNumbers } from "./factsheet";

/**
 * Checks an answer against the factsheet it was supposed to be built from.
 *
 * The rule Orbit already applies to voice -- the server writes the sentence so
 * the model cannot invent a number -- does not survive contact with open
 * questions, because you cannot pre-write a sentence for a question nobody has
 * asked yet. This is the replacement: let the model phrase the answer, then
 * check arithmetically that every number in it was licensed.
 *
 * An unlicensed number is not a style problem. "You have 340 usable minutes"
 * when the real figure is 589 is the single worst thing this product can do,
 * because it is indistinguishable from the truth at a glance.
 */

export interface AnswerCheck {
  ok: boolean;
  /** Numbers in the answer that no fact licenses. */
  unlicensed: number[];
  /** Fact keys the answer appears to rest on, for defending it. */
  cited: string[];
  /** Why it failed, in one line, when it did. */
  note: string;
}

/**
 * Numbers that are never claims about the student: clock times, ordinals in
 * "Problem Set 4", years, percentages of nothing. Stripping them first is what
 * stopped the Critic reading 11:05 as an invented 11.
 */
function claimNumbers(text: string): number[] {
  const stripped = text
    .replace(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi, " ")     // clock times
    .replace(/\b(19|20)\d{2}\b/g, " ")                   // years
    .replace(/\b[A-Z]{2,6}\s?\d{3,4}\b/g, " ");          // course codes
  return [...(stripped.match(/\d+(?:\.\d+)?/g) ?? [])].map(Number);
}

/** Small numbers are ordinary English ("one idea", "the first of two") and are not claims. */
const TRIVIAL = 3;

export function checkAnswer(answer: string, facts: Fact[]): AnswerCheck {
  const licensed = licensedNumbers(facts);
  const used = claimNumbers(answer);
  const unlicensed = [...new Set(used.filter((x) => x > TRIVIAL && !licensed.has(x) && !licensed.has(Math.round(x))))];

  // Which facts the answer leans on: a fact is cited if one of its own numbers
  // appears, or a distinctive run of its words does.
  const cited = facts
    .filter((f) => {
      if (f.numbers.some((x) => used.includes(x))) return true;
      const words = f.text.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? [];
      const hay = answer.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return words.length > 0 && hits / words.length > 0.35;
    })
    .map((f) => f.key);

  return {
    ok: unlicensed.length === 0,
    unlicensed,
    cited,
    note: unlicensed.length ? `numbers no fact supports: ${unlicensed.join(", ")}` : cited.length ? "every number traced to a fact" : "no numbers claimed",
  };
}

/**
 * Things Orbit genuinely does not know, listed rather than inferred.
 *
 * Relying on "no fact matched" to produce a refusal does not work: "should I
 * drop out of university" shares the word *drop* with the cut suggestions and
 * scores well enough to get a confident answer about dropping the gym. The
 * subjects we cannot speak to have to be named.
 *
 * Grades and exam content are the dangerous two. Orbit imports a Canvas
 * calendar, which contains due dates and nothing else -- no scores, no rubric,
 * no syllabus content -- so any answer about either is invention dressed in
 * the same voice as the real numbers.
 */
const OUT_OF_SCOPE: [RegExp, string][] = [
  [/\b(grade|gpa|score|mark|marks|pass(ed|ing)?|fail(ed|ing)?)\b/i, "I do not have your grades. Your Canvas calendar gives me due dates, not scores."],
  [/\b(midterm|final|exam|quiz|test)\b.*\b(on|about|cover|contain|include|expect)\b|\bwhat.*\b(on|in)\b.*\b(midterm|final|exam)\b/i, "I do not know what is on an exam. I only see when things are due, never what they contain."],
  [/\b(weather|rain|snow|temperature|forecast)\b/i, "I do not know the weather."],
  [/\b(drop out|quit (uni|school|college)|change (my )?major|should i (study|take) )\b/i, "That is not mine to answer. I can tell you what your week actually looks like, if that helps you decide."],
  [/\b(who|what) (is|are|was|were)\b(?!.*\b(my|due|left|planned|next)\b)/i, "I only know your own schedule, tasks, bus and history."],
];

/** Returns the honest sentence when a question is outside what Orbit can know. */
export function outOfScope(question: string): string | undefined {
  for (const [re, say] of OUT_OF_SCOPE) if (re.test(question)) return say;
  return undefined;
}

/**
 * The honest refusal. Orbit answering "I do not know" is a feature: the
 * alternative for a scheduling assistant is a confident wrong number, and a
 * student who catches one stops trusting the ones that were right.
 */
export function cannotAnswer(question: string): string {
  return `I do not have anything on that. I know your day, your windows, your tasks, your bus and what your history says about how long things take. ${question.trim().endsWith("?") ? "" : ""}Ask me one of those and I can show you the numbers behind it.`.trim();
}
