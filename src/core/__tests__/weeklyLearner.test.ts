import { beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticStudent } from "../student";
import { runExperiment } from "../../agents/learningExperiment";

const nemotron = vi.fn();
vi.mock("../../agents/models", () => ({ nemotronJson: (...a: unknown[]) => nemotron(...a) }));
const { CLAMP_MAX, emptyMemory, learnFromWeek, seenItems } = await import("../../agents/weeklyLearner");
const { ASPECTS } = await import("../../agents/learningExperiment");
const ASPECT = ASPECTS.assignments;

const obs = (label: string, category: string, estimate: number, actual: number) => ({ label, category, estimate, actual });
/** Week 1 of the brief: a 90 minute assignment that really took 120. */
const week1 = [obs("Problem Set 1", "big_assignment", 90, 120), obs("Essay draft 1", "big_assignment", 150, 200), obs("Homework 1", "assignment", 45, 47)];

const reply = (multipliers: unknown[], memo = "") =>
  nemotron.mockResolvedValue({ data: { multipliers, memo }, provider: "nemotron-hosted", model: "m", latencyMs: 9 });

beforeEach(() => nemotron.mockReset());

describe("what the learner is shown", () => {
  it("sees one week only, and the plan it was working from", () => {
    const memory = { week: 1, multipliers: { big_assignment: 1.3 }, memos: [] };
    const seen = seenItems(week1, memory, ASPECT);
    expect(seen).toHaveLength(3);
    // The consequence of its own last decision: it planned 117 for a 90 minute estimate, and the work took 120.
    expect(seen[0]).toEqual({ label: "Problem Set 1", category: "big_assignment", estimate: 90, planned: 117, actual: 120 });
    // A kind it has not learned yet is planned at the student's own estimate.
    expect(seen[2]).toMatchObject({ category: "assignment", estimate: 45, planned: 45 });
  });

  it("is shown nothing outside the aspect under test", () => {
    const mixed = [...week1, obs("Reading: Chapter 1", "reading", 40, 30), obs("Midterm review", "exam_prep", 180, 240)];
    const seen = seenItems(mixed, emptyMemory(), ASPECT);
    expect(seen.map((s) => s.category).sort()).toEqual(["assignment", "big_assignment", "big_assignment"]);
  });
});

describe("the learner learns from one week", () => {
  it("uses the number Nemotron chose, not one the code computed", async () => {
    reply([{ category: "big_assignment", multiplier: 1.28, reason: "ran a third over" }], "Runs long on big work.");
    const { memory, lesson } = await learnFromWeek(week1, emptyMemory(), 1, ASPECT);
    expect(memory.multipliers.big_assignment).toBe(1.28);
    expect(lesson.provider).toBe("nemotron-hosted");
    expect(lesson.changes[0]).toMatchObject({ category: "big_assignment", from: 1, to: 1.28, clamped: false });
  });

  it("carries its own memory into the next week", async () => {
    reply([{ category: "big_assignment", multiplier: 1.28, reason: "" }], "Runs long on big work.");
    const w1 = await learnFromWeek(week1, emptyMemory(), 1, ASPECT);
    expect(w1.memory.memos).toEqual([{ week: 1, text: "Runs long on big work." }]);

    reply([{ category: "big_assignment", multiplier: 1.33, reason: "" }], "Still short.");
    const w2 = await learnFromWeek([obs("Problem Set 2", "big_assignment", 90, 122)], w1.memory, 2, ASPECT);
    const sent = JSON.parse(nemotron.mock.calls.at(-1)![1] as string); // the week 2 call
    expect(sent.yourMemory).toEqual(["week 1: Runs long on big work."]);
    expect(sent.yourCurrentMultipliers).toEqual({ big_assignment: 1.28 });
    expect(sent.thisWeek).toHaveLength(1); // only week 2, never the history
    expect(w2.memory.multipliers.big_assignment).toBe(1.33);
    expect(w2.memory.memos.map((m) => m.week)).toEqual([1, 2]);
  });

  it("clamps an absurd multiplier but keeps the model's judgement inside the rail", async () => {
    reply([{ category: "big_assignment", multiplier: 50, reason: "" }]);
    const { memory, lesson } = await learnFromWeek(week1, emptyMemory(), 1, ASPECT);
    expect(memory.multipliers.big_assignment).toBe(CLAMP_MAX);
    expect(lesson.changes[0].clamped).toBe(true);
  });

  it("ignores a kind it did not see this week, or one outside the aspect", async () => {
    reply([
      { category: "big_assignment", multiplier: 1.3, reason: "" },
      { category: "lab", multiplier: 1.4, reason: "" },      // no lab session this week
      { category: "reading", multiplier: 0.5, reason: "" },  // outside the aspect
    ]);
    const { memory } = await learnFromWeek(week1, emptyMemory(), 1, ASPECT);
    expect(memory.multipliers).toEqual({ big_assignment: 1.3 });
  });

  it("falls back to a running average when the model cannot be reached", async () => {
    nemotron.mockResolvedValue({ data: { multipliers: [], memo: "" }, provider: "heuristic", latencyMs: 0, error: "no NVIDIA_API_KEY" });
    const { memory, lesson } = await learnFromWeek(week1, emptyMemory(), 1, ASPECT);
    expect(lesson.provider).toBe("heuristic");
    // big assignments ran (120/90 + 200/150) / 2 = 1.3333; a third of the way from 1 is 1.11.
    expect(memory.multipliers.big_assignment).toBeCloseTo(1.11, 2);
    expect(lesson.error).toMatch(/NVIDIA_API_KEY/);
  });

  it("changes nothing when the week held no work of this kind", async () => {
    const { memory, lesson } = await learnFromWeek([], emptyMemory(), 1, ASPECT);
    expect(memory.multipliers).toEqual({});
    expect(lesson.changes).toEqual([]);
    expect(nemotron).not.toHaveBeenCalled();
  });
});

describe("experiment: one week at a time actually improves the next week", () => {
  it("plans week 2 better than week 1 after seeing week 1, without the model", async () => {
    const x = await runExperiment("assignments", ["raw", "weekly-rules"]);
    const raw = x.arms[0], learner = x.arms[1];
    // Week 1 is planned with nothing learned, so both arms must be identical there.
    expect(learner.perWeek[0].mae).toBe(raw.perWeek[0].mae);
    // Week 2 is the test: the same sessions, planned better because week 1 was seen.
    expect(learner.perWeek[1].mae).toBeLessThan(raw.perWeek[1].mae);
    // And it keeps improving rather than bouncing.
    expect(learner.total.mae).toBeLessThan(raw.total.mae * 0.5);
    expect(learner.lessons![0].changes.length).toBeGreaterThan(0);
  });

  it("holds on a student it was never tuned on", async () => {
    const { studentB } = await import("../student");
    const x = await runExperiment("assignments", ["raw", "weekly-rules"], { student: studentB() });
    expect(x.arms[1].perWeek[1].mae).toBeLessThan(x.arms[0].perWeek[1].mae);
    expect(x.arms[1].total.mae).toBeLessThan(x.arms[0].total.mae * 0.5);
  });

  it("never scores a week with a plan that had already seen it", async () => {
    const s = syntheticStudent();
    const x = await runExperiment("assignments", ["raw", "weekly-rules"], { student: s });
    // The learner's week-1 plan is the raw estimate, proving nothing leaked backwards.
    const firstLesson = x.arms[1].lessons![0];
    expect(firstLesson.sessions.every((sn) => sn.planned === sn.estimate)).toBe(true);
  });
});
