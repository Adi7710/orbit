import { describe, expect, it } from "vitest";
import { applyDecisions, emptyProfile, planMinutes, scorePlans, taskKind, weeklyCandidates } from "../learning";
import { syntheticStudent, TRAITS } from "../student";
import type { HabitRecord } from "../habits";

const row = (title: string, planned: number, actual: number, week: number, day = 1): HabitRecord => ({
  taskId: `${title}-${week}-${actual}`, title, domain: "build", plannedMinutes: planned, actualMinutes: actual, completedAt: new Date(Date.UTC(2026, 8, day + week * 7)), inGap: true, week,
});

describe("what kind of work is it", () => {
  it("classifies by title, and calls a 90+ minute assignment big", () => {
    expect(taskKind("Problem Set 4", 90)).toBe("big_assignment");
    expect(taskKind("Homework 3", 45)).toBe("assignment");
    expect(taskKind("Lab 2 report", 120)).toBe("lab");
    expect(taskKind("Essay draft", 150)).toBe("big_assignment");
    expect(taskKind("Reading: Chapter 3", 40)).toBe("reading");
    expect(taskKind("Midterm review (cram)", 180)).toBe("exam_prep");
    expect(taskKind("Email my advisor", 15)).toBe("other");
  });
});

describe("the weekly candidates (hand-computed)", () => {
  // Three big assignments estimated at 90: took 120 and 120 in week 1, 108 in week 2.
  // ratios 1.3333, 1.3333, 1.2; mean 1.28889; shrunk (3*1.28889 + 1) / 4 = 1.21667.
  const h = [row("Problem Set 1", 90, 120, 1), row("Essay draft 1", 90, 120, 1, 2), row("Problem Set 2", 90, 108, 2)];

  it("measures the ratio and the shrunk target", () => {
    const [c] = weeklyCandidates(h, emptyProfile(), 2);
    expect(c.kind).toBe("big_assignment");
    expect(c.n).toBe(3);
    expect(c.meanRatio).toBeCloseTo(1.289, 3);
    expect(c.target).toBeCloseTo(1.217, 3);
    expect(c.weeklyRatio).toEqual([{ week: 1, ratio: 1.333, n: 2 }, { week: 2, ratio: 1.2, n: 1 }]);
    expect(c.eligible).toBe(true);
    expect(c.example).toEqual({ title: "Problem Set 2", estimate: 90, actual: 108, week: 2 });
  });

  it("only looks at weeks up to the one being reviewed", () => {
    const [c] = weeklyCandidates(h, emptyProfile(), 1);
    expect(c.n).toBe(2);
    expect(c.meanRatio).toBeCloseTo(1.333, 3);
    expect(c.target).toBeCloseTo(1.222, 3); // (2*1.3333 + 1) / 3
  });

  it("is not eligible with one session or with a change under 0.05", () => {
    expect(weeklyCandidates([row("Problem Set 1", 90, 120, 1)], emptyProfile(), 1)[0].eligible).toBe(false);
    const flat = [row("Homework 1", 45, 45, 1), row("Homework 2", 45, 46, 2)];
    expect(weeklyCandidates(flat, emptyProfile(), 2)[0].eligible).toBe(false);
  });
});

describe("applying decisions", () => {
  const h = [row("Problem Set 1", 90, 120, 1), row("Essay draft 1", 90, 120, 1, 2), row("Problem Set 2", 90, 108, 2)];
  const cands = weeklyCandidates(h, emptyProfile(), 2);

  it("adopt jumps to the target, step goes halfway, hold changes nothing", () => {
    const adopt = applyDecisions(emptyProfile(), cands, [{ kind: "big_assignment", action: "adopt", reason: "" }], 2);
    expect(adopt.multipliers.big_assignment?.value).toBeCloseTo(1.217, 3);
    expect(adopt.version).toBe(1);
    const step = applyDecisions(emptyProfile(), cands, [{ kind: "big_assignment", action: "step", reason: "" }], 2);
    expect(step.multipliers.big_assignment?.value).toBeCloseTo(1.1085, 2);
    const hold = applyDecisions(emptyProfile(), cands, [{ kind: "big_assignment", action: "hold", reason: "" }], 2);
    expect(hold.multipliers).toEqual({});
    expect(hold.version).toBe(0);
  });

  it("never changes a kind without enough evidence, whatever was decided", () => {
    const thin = weeklyCandidates([row("Problem Set 1", 90, 120, 1)], emptyProfile(), 1);
    const out = applyDecisions(emptyProfile(), thin, [{ kind: "big_assignment", action: "adopt", reason: "" }], 1);
    expect(out.multipliers).toEqual({});
  });

  it("plans the student's estimate times what it learned, and the estimate itself when nothing is learned", () => {
    const learned = applyDecisions(emptyProfile(), cands, [{ kind: "big_assignment", action: "adopt", reason: "" }], 2);
    expect(planMinutes(90, "big_assignment", learned)).toBe(110); // 90 * 1.217 = 109.5
    expect(planMinutes(90, "big_assignment", emptyProfile())).toBe(90);
    expect(planMinutes(40, "reading", learned)).toBe(40);
  });
});

describe("scoring plans against what happened", () => {
  it("counts error, bias, under-planning and minutes short", () => {
    // errors: 90-120 = -30, 90-100 = -10. |errors| mean 20. under-planned: 90 < 108 yes, 90 < 90 no.
    expect(scorePlans([{ plan: 90, actual: 120 }, { plan: 90, actual: 100 }])).toEqual({ sessions: 2, mae: 20, bias: -20, underPlanned: 0.5, minutesShort: 40 });
    expect(scorePlans([]).sessions).toBe(0);
  });
});

describe("the synthetic student", () => {
  const s = syntheticStudent();

  it("is deterministic, synthetic, and eight weeks long", () => {
    expect(JSON.stringify(syntheticStudent())).toBe(JSON.stringify(s));
    expect(s.sessions).toHaveLength(56);
    expect(s.sessions.every((r) => r.synthetic)).toBe(true);
    expect(Math.max(...s.sessions.map((r) => r.week ?? 0))).toBe(8);
    expect(s.walks).toHaveLength(80);
  });

  it("starts with the story from the brief: a 90 minute problem set that takes about two hours", () => {
    const ps = s.sessions.find((r) => r.title === "Problem Set 1")!;
    expect(ps.plannedMinutes).toBe(90);
    expect(ps.actualMinutes).toBeGreaterThan(105);
    expect(ps.actualMinutes).toBeLessThan(135);
  });

  it("carries the hidden traits in the logs", () => {
    const all = weeklyCandidates(s.sessions, emptyProfile(), 8);
    for (const c of all) expect(Math.abs(c.meanRatio - TRAITS.factor[c.kind])).toBeLessThan(0.06);
    const walk = s.walks.reduce((a, w) => a + w.actualMinutes / w.plannedMinutes, 0) / s.walks.length;
    expect(walk).toBeGreaterThan(1.12);
    expect(walk).toBeLessThan(1.19);
    const lead = s.sessions.filter((r) => r.startedHoursBeforeDue !== undefined && r.title.startsWith("Problem")).map((r) => r.startedHoursBeforeDue!);
    expect(lead.every((h) => h > 0)).toBe(true);
  });
});
