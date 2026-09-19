import { describe, expect, it } from "vitest";
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
