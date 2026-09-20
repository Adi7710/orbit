import { beforeEach, describe, expect, it } from "vitest";
import { asSentence, resolveTask, speakReason, spoken, spokenClock, spokenDuration } from "@/agents/voiceTools";
import type { Task } from "@/core/types";

const t = (id: string, title: string, courseCode?: string): Task => ({ id, title, domain: "build", estimateMinutes: 60, source: "manual", courseCode });
const tasks = [t("ps4", "Problem Set 4", "MATH 0220"), t("read", "Reading: Chapter 3", "CS 0441"), t("essay", "Essay draft", "ENGCMP 0200"), t("gym", "Gym")];

describe("speaking numbers so TTS does not mangle them", () => {
  it("says whole numbers", () => {
    expect(spoken(95)).toBe("ninety-five");
    expect(spoken(143)).toBe("one hundred forty-three");
    expect(spoken(7)).toBe("seven");
  });
  it("says durations the way a person would", () => {
    expect(spokenDuration(589)).toBe("nine hours forty-nine");
    expect(spokenDuration(45)).toBe("forty-five minutes");
    expect(spokenDuration(120)).toBe("two hours");
  });
  it("says clock times without am or pm", () => {
    expect(spokenClock(11 * 60 + 5)).toBe("eleven oh five");
    expect(spokenClock(14 * 60 + 21)).toBe("two twenty-one");
    expect(spokenClock(15 * 60)).toBe("three o'clock");
  });
});

describe("resolving what the student actually said", () => {
  it("matches a partial name", () => {
    expect(resolveTask("the problem set", tasks).task?.id).toBe("ps4");
    expect(resolveTask("essay", tasks).task?.id).toBe("essay");
  });
  it("matches by course code", () => {
    expect(resolveTask("the math 0220 thing", tasks).task?.id).toBe("ps4");
  });
  it("asks instead of guessing when two match equally", () => {
    const two = [t("a", "Homework 1 Logic", "CS 0441"), t("b", "Homework 2 Proofs", "CS 0441")];
    const r = resolveTask("homework", two);
    expect(r.task).toBeUndefined();
    expect(r.ambiguous?.length).toBe(2);
  });
  it("returns nothing when it cannot find it", () => {
    expect(resolveTask("laundry", tasks).task).toBeUndefined();
  });
  it("never resolves to a completed task", () => {
    const done = [{ ...tasks[0], completedAt: new Date() }];
    expect(resolveTask("problem set", done).task).toBeUndefined();
  });
});

describe("speaking whole sentences", () => {
  it("capitalizes every sentence, not just the first", () => {
    expect(asSentence("ninety-five minutes logged. one hundred twenty XP. you are on track"))
      .toBe("Ninety-five minutes logged. One hundred twenty XP. You are on track");
  });
  it("speaks counts in reasons but leaves course codes alone", () => {
    expect(speakReason("95 focused minutes")).toBe("ninety-five focused minutes");
    expect(speakReason("2-week streak")).toBe("two-week streak");
    expect(speakReason("done inside a planned gap")).toBe("done inside a planned gap");
  });
});

// MARK: - Nemotron-backed tools


import { handleVoiceTool, speakNumbers } from "@/agents/voiceTools";
import { reset, store } from "@/lib/store";

describe("speaking insight sentences", () => {
  it("says percents, multipliers and decimals as words", () => {
    expect(speakNumbers("You work about 21% faster before noon.")).toBe("You work about twenty-one percent faster before noon.");
    expect(speakNumbers("Graded work takes you 1.53x what you estimate.")).toBe("Graded work takes you one point five three times what you estimate.");
    expect(speakNumbers("You usually finish 5.88 hours before it is due.")).toBe("You usually finish five point eight eight hours before it is due.");
  });
});

describe("voice tools backed by the learning log", () => {
  beforeEach(() => reset());

  it("get_estimate speaks the calibrated minutes and where the task fits", async () => {
    const r = await handleVoiceTool({ tool: "get_estimate", task: "the problem set" });
    expect(r.ok).toBe(true);
    // MATH 0220 has six seeded samples at about 1.6x: 90 minutes becomes 144 (two hours twenty-four).
    expect(r.text).toContain("You would say one hour thirty for Problem Set 4, but your history says two hours twenty-four");
    expect(r.text).toContain("It fits your");
    expect(r.text.replace("Problem Set 4", "")).not.toMatch(/\d/); // the title is read as written; every number is spoken
  });

  it("get_estimate asks instead of guessing, and says so when it cannot find the task", async () => {
    store().tasks.push({ id: "x", title: "Problem Set 5", domain: "build", estimateMinutes: 60, source: "manual", courseCode: "MATH 0220" });
    expect((await handleVoiceTool({ tool: "get_estimate", task: "problem set" })).text).toMatch(/^Which one/);
    expect((await handleVoiceTool({ tool: "get_estimate", task: "laundry" })).ok).toBe(false);
  });

  it("get_coach says plainly when it does not know the student yet", async () => {
    const { resetLearned } = await import("@/lib/learned");
    resetLearned();
    // No weekly review and no history at all. With history but no review,
    // get_coach answers from the completions instead (next test but one).
    store().habits = [];
    const r = await handleVoiceTool({ tool: "get_coach" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/do not know enough about you yet/);
    expect(r.text).not.toMatch(/\d/);
  });

  it("get_coach speaks what the weekly review learned, in words, with no model call", async () => {
    const { learned, resetLearned } = await import("@/lib/learned");
    resetLearned();
    learned().aspects.work_length = {
      memory: { week: 2, multipliers: { big_assignment: 1.4 }, evidence: {}, memos: [] },
      observations: 6, active: true, lastReviewedWeek: 2, lessons: [],
    };
    const r = await handleVoiceTool({ tool: "get_coach" });
    expect(r.text).toContain("Here is what I have worked out about you.");
    expect(r.text).toMatch(/longer than you think/);
    // Every number is spoken, so text-to-speech never reads a bare digit.
    expect(r.text).not.toMatch(/\d/);
  });

  it("get_coach answers from the completion history when nothing has been learned yet", async () => {
    const { resetLearned } = await import("@/lib/learned");
    resetLearned();
    const r = await handleVoiceTool({ tool: "get_coach" });
    expect(r.ok).toBe(true);
    expect(r.text).toContain("Here is what your history says.");
    expect(r.text).not.toMatch(/\d/);
  });

  it("log_actual by voice feeds the learning log exactly like a tap", async () => {
    const before = store().habits.length;
    const r = await handleVoiceTool({ tool: "log_actual", task: "reading", minutes: 35 });
    expect(r.ok).toBe(true);
    expect(store().habits).toHaveLength(before + 1);
    const row = store().habits.at(-1)!;
    expect(row).toMatchObject({ taskId: "read", actualMinutes: 35, plannedMinutes: 40 });
    expect(row.synthetic).toBeUndefined();
  });
});

describe("speaking clock times and course codes", () => {
  // Both heard in the Tuesday rehearsal and caught by no test: every fact
  // with a clock time in it is only reachable on a weekday.
  it("says a clock time as a time, not as two numbers with a colon", () => {
    expect(speakNumbers("starts at 14:30")).toBe("starts at two thirty");
    expect(speakNumbers("from 11:10 to 9:05")).toBe("from eleven ten to nine oh five");
    expect(speakNumbers("due Monday 12:58 AM")).toBe("due Monday twelve fifty-eight AM");
  });
  it("says a course code digit by digit", () => {
    expect(speakNumbers("MGT 808 and FE 621")).toBe("MGT eight oh eight and FE six two one");
    expect(speakNumbers("MATH 0220")).toBe("MATH oh two two oh");
  });
  it("still says plain quantities as quantities", () => {
    expect(speakNumbers("144 minutes, 21% faster, 1.53x")).toBe("one hundred forty-four minutes, twenty-one percent faster, one point five three times");
  });
});
