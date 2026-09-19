import { describe, expect, it } from "vitest";
import { buildFactsheet, licensedNumbers, type TodayLike } from "@/core/factsheet";
import { checkAnswer, outOfScope } from "@/core/answerCheck";
import { leadsWith, QUESTION_BANK, satisfies } from "@/core/questionBank";
import { rank } from "@/agents/ask";

const today: TodayLike = {
  mode: "normal",
  user: { xpWeek: 340, streakWeeks: 2 },
  ledger: { usable: 589, naiveFree: 815, travel: 46, meals: 115, routines: 65, fixed: 200, queued: 1149, slack: -560, overCommitted: true },
  gaps: [
    { id: "g665", startText: "11:05", endText: "14:21", usable: 196, pick: { title: "Problem Set 4", estimateMinutes: 90 } },
    { id: "g950", startText: "15:50", endText: "23:44", usable: 474, pick: null },
  ],
  tasks: [
    { id: "ps4", title: "Problem Set 4", planningMinutes: 144, estimateMinutes: 90, courseCode: "MATH 0220" },
    { id: "cs1", title: "Case Study: Deloitte", planningMinutes: 200, estimateMinutes: 120, courseCode: "MGT 808" },
  ],
  bus: { route: "61B", leaveByText: "15:48", departsText: "15:52", arrivalText: "16:08", status: "live", rideMinutes: 9, walkToStop: 2, from: "Cathedral", to: "Home", verdict: { makesIt: true, marginMin: 46 }, classAtText: "16:54" },
  calibration: [{ key: "MGT 808::build", samples: 5, multiplier: 1.67 }],
  cuts: [{ task: { title: "Gym" }, minutesSaved: 60 }],
  transit: { clockText: "16:26", realtimeOk: true },
};

const facts = buildFactsheet(today);

describe("the factsheet is the only thing an answer may be built from", () => {
  it("states the ledger with both numbers", () => {
    const f = facts.find((x) => x.key === "ledger.usable")!;
    expect(f.text).toContain("589");
    expect(f.text).toContain("815");
    expect(f.numbers).toContain(589);
  });

  it("carries a source for every fact, so an answer can defend itself", () => {
    for (const f of facts) expect(f.source.length, f.key).toBeGreaterThan(5);
  });

  it("licenses numbers printed in a fact even when the fact did not declare them", () => {
    // "Problem Set 4" and "the 61B" are not claims about the student, but they
    // are digits in the text. Reading them as invented is how four correct
    // answers got thrown away and a grounding failure was reported that had
    // not happened.
    const licensed = licensedNumbers(facts);
    expect(licensed.has(4)).toBe(true);
    expect(licensed.has(61)).toBe(true);
  });
});

describe("the verifier", () => {
  it("passes an answer whose every number comes from a fact", () => {
    const c = checkAnswer("You have 589 usable minutes, not the 815 your calendar claims.", facts);
    expect(c.ok).toBe(true);
    expect(c.cited).toContain("ledger.usable");
  });

  it("catches an invented total, which is the worst thing this product can do", () => {
    // Checked against the facts the answer was built from, not the whole
    // sheet. Against everything, "340 usable minutes" is licensed by the XP
    // fact that happens to say 340 -- a number borrowed from an unrelated fact
    // is precisely the confident wrong number this is here to stop.
    const ledgerOnly = facts.filter((f) => f.key.startsWith("ledger"));
    const c = checkAnswer("You have 340 usable minutes today.", ledgerOnly);
    expect(c.ok).toBe(false);
    expect(c.unlicensed).toContain(340);
  });

  it("does not read a clock time as a quantity claim", () => {
    expect(checkAnswer("Leave at 15:48 and you are fine.", facts).ok).toBe(true);
  });

  it("does not read a course code as a quantity claim", () => {
    expect(checkAnswer("Your MGT 808 work runs long.", facts).ok).toBe(true);
  });
});

describe("refusing what Orbit cannot know", () => {
  it("refuses exam content, because the calendar holds due dates and nothing else", () => {
    expect(outOfScope("What will be on the midterm?")).toBeTruthy();
  });

  it("refuses grades", () => {
    expect(outOfScope("What is my grade in this course?")).toBeTruthy();
  });

  it("refuses life advice even when it shares a word with a real feature", () => {
    // "drop" also appears in the cut suggestions, which is exactly how this
    // used to get a confident answer about skipping the gym.
    expect(outOfScope("Should I drop out of university?")).toBeTruthy();
    expect(outOfScope("What should I drop today?")).toBeUndefined();
  });

  it("answers questions that are genuinely in scope", () => {
    for (const q of ["How much time do I have?", "When do I need to leave?", "Am I over-committed?"]) {
      expect(outOfScope(q), q).toBeUndefined();
    }
  });
});

describe("retrieval picks the facts a question is actually about", () => {
  const keys = (q: string) => rank(q, facts).map((f) => f.key);

  it("sends a time question to the ledger", () => {
    expect(keys("How much time do I actually have today?")[0]).toMatch(/^ledger/);
  });

  it("sends a bus question to the bus, not the estimator history", () => {
    // "on time" makes "time" a question word, which matches "times" in every
    // calibration fact. This used to answer a bus question out of the history.
    expect(keys("Will I make it to class on time?")[0]).toMatch(/^bus/);
  });

  it("leads with the longest window when asked for the longest window", () => {
    expect(keys("How long is my longest free stretch?")[0]).toBe("gap.best");
  });

  it("finds estimates even though the question says 'estimates' and the fact says 'estimate'", () => {
    expect(keys("How do you know that about my estimates?")[0]).toMatch(/^calibration/);
  });

  it("returns nothing for a question no fact touches, so the agent refuses", () => {
    expect(rank("what is the capital of peru", facts)).toHaveLength(0);
  });
});

describe("the question bank", () => {
  it("has unique ids", () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes questions whose only right answer is a refusal", () => {
    expect(QUESTION_BANK.filter((q) => q.mustRefuse).length).toBeGreaterThanOrEqual(4);
  });

  it("satisfies matches a key by prefix", () => {
    expect(satisfies(["cut.Gym"], ["cut."])).toBe(true);
    expect(satisfies(["gap.g665"], ["bus.verdict"])).toBe(false);
  });

  it("leadsWith rejects an answer that buries the right fact", () => {
    // The failure it was written for: the bus verdict cited third, behind two
    // paragraphs of estimator history.
    expect(leadsWith(["calibration.a", "calibration.b", "bus.verdict"], ["bus.verdict"])).toBe(false);
    expect(leadsWith(["bus.verdict", "bus.legs"], ["bus.verdict"])).toBe(true);
  });
});
