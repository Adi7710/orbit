import { describe, expect, it } from "vitest";
import { CLAMP_HI, CLAMP_LO, clampToBaseline, heuristicMinutes } from "@/core/estimator";

/**
 * The anchored variant's safety claim, pinned.
 *
 * docs/eval.md tells a judge that a five-times miss is "structurally
 * impossible rather than merely discouraged". Until now that sentence rested
 * on a prompt instruction and four lines of arithmetic buried inside a
 * function that could not run without an API key -- which meant the one claim
 * we most wanted checked was the one claim nobody could check. These tests
 * run with no key and no network.
 */
describe("the clamp that makes the anchored variant safe", () => {
  it("reproduces the exact failure from run 1: Quiz 3 prep cannot come back as 240", () => {
    // The original zero-shot miss: 240 predicted against 50 actual, because
    // the prompt's bands named exam prep and never mentioned quizzes.
    const baseline = heuristicMinutes("Quiz 3 prep");
    expect(baseline).toBe(45);

    const c = clampToBaseline(240, baseline);
    expect(c.lo).toBe(23);
    expect(c.hi).toBe(90);
    expect(c.minutes).toBe(90);
    expect(c.clamped).toBe(true);

    // The point is not that 90 is right -- actual was 50. The point is that
    // the error collapses from 190 minutes to 40, without the model improving
    // at all. A wrong answer stays wrong; it stops being catastrophic.
    expect(Math.abs(c.minutes - 50)).toBeLessThan(Math.abs(240 - 50));
  });

  it("leaves a sensible correction alone, which is the whole reason to keep the model", () => {
    // A clamp that fired on everything would just be the heuristic wearing a
    // model's coat. Within the window the model wins.
    const baseline = heuristicMinutes("Quiz 3 prep");
    const c = clampToBaseline(50, baseline);
    expect(c.minutes).toBe(50);
    expect(c.clamped).toBe(false);
  });

  it("pulls up an implausibly small answer too, not just a large one", () => {
    const baseline = heuristicMinutes("Essay draft"); // 180
    const c = clampToBaseline(5, baseline);
    expect(c.minutes).toBe(90);
    expect(c.clamped).toBe(true);
  });

  it("bounds the error for every title in the eval set, whatever the model says", () => {
    // The property that actually matters: for any model output at all,
    // including an absurd one, the planned minutes stay inside [0.5x, 2x].
    const titles = ["Quiz 3 prep", "Problem Set 4", "Lab 2 report", "Essay draft", "Read Chapter 3", "Gym", "Midterm prep"];
    for (const title of titles) {
      const baseline = heuristicMinutes(title);
      for (const raw of [1, 7, 45, 240, 999, 100000]) {
        const c = clampToBaseline(raw, baseline);
        expect(c.minutes).toBeGreaterThanOrEqual(Math.round(baseline * CLAMP_LO));
        expect(c.minutes).toBeLessThanOrEqual(Math.round(baseline * CLAMP_HI));
      }
    }
  });

  it("is exactly inclusive at both edges", () => {
    const c = clampToBaseline(90, 45);
    expect(c.clamped).toBe(false); // 90 is hi, not beyond it
    expect(clampToBaseline(91, 45).clamped).toBe(true);
    expect(clampToBaseline(23, 45).clamped).toBe(false);
    expect(clampToBaseline(22, 45).clamped).toBe(true);
  });

  it("states the window it advertises", () => {
    expect(CLAMP_LO).toBe(0.5);
    expect(CLAMP_HI).toBe(2);
  });
});
