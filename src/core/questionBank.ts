/**
 * The questions Orbit has to be able to answer, and what a right answer rests on.
 *
 * This is the thing that makes "it gets stronger" measurable rather than a
 * claim. Every question names the fact keys a correct answer must lean on, so
 * a run produces a number -- how many it grounded correctly -- and a list of
 * exactly which ones it got wrong. A change either moves that number or it did
 * not.
 *
 * `mustRefuse` questions are as important as the rest. An assistant that
 * answers "what will be on the midterm" with anything other than "I do not
 * know that" is the failure mode this whole design exists to prevent, and it
 * is the one nobody writes a test for.
 */

export interface BankQuestion {
  id: string;
  q: string;
  /** Fact keys, or key prefixes, a grounded answer should rest on. */
  expect: string[];
  /** True when the only correct behaviour is an honest refusal. */
  mustRefuse?: boolean;
  tag: "ledger" | "windows" | "tasks" | "bus" | "history" | "game" | "meta" | "outofscope";
}

export const QUESTION_BANK: BankQuestion[] = [
  // The ledger: the claim the whole product rests on.
  { id: "q1", q: "How much time do I actually have today?", expect: ["ledger.usable"], tag: "ledger" },
  { id: "q2", q: "Why is that less than what my calendar says?", expect: ["ledger.missing"], tag: "ledger" },
  { id: "q3", q: "Where did those minutes go?", expect: ["ledger.missing"], tag: "ledger" },
  { id: "q4", q: "Am I over-committed?", expect: ["ledger.commitment"], tag: "ledger" },
  { id: "q5", q: "How far behind am I?", expect: ["ledger.commitment"], tag: "ledger" },
  { id: "q6", q: "What should I drop?", expect: ["cut.", "ledger.commitment"], tag: "ledger" },

  // Windows.
  { id: "q7", q: "When is my best window today?", expect: ["gap."], tag: "windows" },
  { id: "q8", q: "How long is my longest free stretch?", expect: ["gap."], tag: "windows" },
  { id: "q9", q: "What should I do in my next gap?", expect: ["gap."], tag: "windows" },

  // Tasks and estimates.
  { id: "q10", q: "How many things do I still have to do?", expect: ["tasks.count"], tag: "tasks" },
  { id: "q11", q: "How long will the case study take me?", expect: ["task.", "calibration."], tag: "tasks" },
  { id: "q12", q: "What is due soonest?", expect: ["tasks.count", "task."], tag: "tasks" },

  // Bus.
  { id: "q13", q: "When do I need to leave?", expect: ["bus.leave"], tag: "bus" },
  // bus.noclass is a legitimate answer: on an evening with no class left,
  // "there is nothing to be late for" is the true one.
  { id: "q14", q: "Will I make it to class on time?", expect: ["bus.verdict", "bus.noclass"], tag: "bus" },
  { id: "q15", q: "How much of that trip is walking?", expect: ["bus.legs"], tag: "bus" },

  // History: the part that is actually learned.
  { id: "q16", q: "Do I underestimate how long my work takes?", expect: ["calibration."], tag: "history" },
  { id: "q17", q: "How do you know that about my estimates?", expect: ["calibration."], tag: "history" },

  // Game.
  { id: "q18", q: "How much XP do I have this week?", expect: ["xp"], tag: "game" },

  // Meta: defending itself is a first-class capability, not a nicety.
  { id: "q19", q: "Why should I believe your numbers?", expect: ["ledger.usable", "ledger.missing"], tag: "meta" },
  { id: "q20", q: "What mode am I in?", expect: ["mode"], tag: "meta" },

  // Out of scope. The only right answer is an honest one.
  { id: "q21", q: "What will be on the midterm?", expect: [], mustRefuse: true, tag: "outofscope" },
  { id: "q22", q: "What is my grade in this course?", expect: [], mustRefuse: true, tag: "outofscope" },
  { id: "q23", q: "Should I drop out of university?", expect: [], mustRefuse: true, tag: "outofscope" },
  { id: "q24", q: "What is the weather tomorrow?", expect: [], mustRefuse: true, tag: "outofscope" },
];

/** A fact key satisfies an expectation if it matches exactly or by prefix ("cut." matches "cut.Gym"). */
export const satisfies = (cited: string[], expect: string[]) =>
  expect.length === 0 || expect.some((e) => cited.some((c) => (e.endsWith(".") ? c.startsWith(e) : c === e)));

/**
 * Whether the expected fact actually *led* the answer.
 *
 * `satisfies` only asks that the right fact appear somewhere, and that let a
 * real failure pass: "will I make it to class on time?" opened with two
 * paragraphs of estimator history and mentioned the bus third. It was scored a
 * pass because the right key was in the list. An answer that buries the answer
 * has not answered.
 */
export const leadsWith = (leadKeys: string[], expect: string[]) =>
  expect.length === 0 || expect.some((e) => leadKeys.slice(0, 2).some((c) => (e.endsWith(".") ? c.startsWith(e) : c === e)));
