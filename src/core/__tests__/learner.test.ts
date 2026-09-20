import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProfile } from "../learning";
import { studentB, syntheticStudent } from "../student";
import { runExperiment } from "../../agents/learningExperiment";

const nemotron = vi.fn();
vi.mock("../../agents/models", () => ({ nemotronJson: (...a: unknown[]) => nemotron(...a) }));
const { reviewWeek, whyNoteRejected } = await import("../../agents/learner");

const student = syntheticStudent();
const reply = (decisions: unknown[], notes: unknown[] = []) => nemotron.mockResolvedValue({ data: { decisions, notes }, provider: "nemotron-hosted", model: "m", latencyMs: 7 });
beforeEach(() => nemotron.mockReset());

describe("the weekly review agent", () => {
  it("falls back to the rules decision, and says so, when the model is unavailable", async () => {
    nemotron.mockResolvedValue({ data: { decisions: [], notes: [] }, provider: "heuristic", latencyMs: 0, error: "no NVIDIA_API_KEY" });
    const { profile, review } = await reviewWeek(student.sessions, emptyProfile(), 2);
    expect(review.provider).toBe("heuristic");
    expect(review.decisions.every((d) => d.source === "rules" && d.action === "adopt")).toBe(true);
    expect(profile.multipliers.big_assignment?.value).toBeGreaterThan(1.2);
    expect(review.notes.every((n) => n.source === "rules")).toBe(true);
  });

  it("never calls the model when asked for rules only", async () => {
    await reviewWeek(student.sessions, emptyProfile(), 2, { useModel: false });
    expect(nemotron).not.toHaveBeenCalled();
  });

  it("does what the model decides: hold leaves a kind alone", async () => {
    reply([{ kind: "big_assignment", action: "hold", reason: "one odd week" }, { kind: "reading", action: "adopt", reason: "consistent" }]);
    const { profile } = await reviewWeek(student.sessions, emptyProfile(), 2);
    expect(profile.multipliers.big_assignment).toBeUndefined();
    expect(profile.multipliers.reading?.value).toBeLessThan(1);
  });

  it("takes the number from the code, not from the model", async () => {
    reply([{ kind: "big_assignment", action: "adopt", reason: "consistent", multiplier: 5, target: 5 }]);
    const { profile } = await reviewWeek(student.sessions, emptyProfile(), 2);
    expect(profile.multipliers.big_assignment?.value).toBeGreaterThan(1.15);
    expect(profile.multipliers.big_assignment?.value).toBeLessThan(1.35);
  });

  it("refuses to change a kind with too little evidence and records why", async () => {
    // Week 1 has a single lab report, one session, which is not enough to change the plan.
    reply([{ kind: "lab", action: "adopt", reason: "" }]);
    const { profile, review } = await reviewWeek(student.sessions, emptyProfile(), 1);
    expect(profile.multipliers.lab).toBeUndefined();
    expect(review.rejections.some((j) => /lab/.test(j.what) && /not enough evidence/.test(j.reason))).toBe(true);
  });

  it("adopts by rule when the model skips an eligible kind", async () => {
    reply([]);
    const { review } = await reviewWeek(student.sessions, emptyProfile(), 3);
    expect(review.decisions.every((d) => d.source === "rules")).toBe(true);
    expect(review.rejections.length).toBeGreaterThan(0);
  });

  it("keeps a note whose numbers are real and replaces one that invents a statistic", async () => {
    const { review: base } = await reviewWeek(student.sessions, emptyProfile(), 2, { useModel: false });
    const big = base.candidates.find((c) => c.kind === "big_assignment")!;
    reply(
      [{ kind: "big_assignment", action: "adopt", reason: "consistent" }],
      [{ kind: "big_assignment", text: `Big assignments run ${big.meanRatio}x your estimate, like ${big.example.title}: planned ${big.example.estimate}, took ${big.example.actual}.` }],
    );
    const ok = await reviewWeek(student.sessions, emptyProfile(), 2);
    expect(ok.review.notes[0].source).toBe("nemotron");

    reply([{ kind: "big_assignment", action: "adopt", reason: "consistent" }], [{ kind: "big_assignment", text: "You take 73% longer than planned on big assignments." }]);
    const bad = await reviewWeek(student.sessions, emptyProfile(), 2);
    expect(bad.review.notes[0].source).toBe("rules");
    expect(bad.review.rejections.some((j) => /73/.test(j.reason))).toBe(true);
  });

  it("whyNoteRejected ignores week numbers and accepts percent forms of real ratios", async () => {
    const { review } = await reviewWeek(student.sessions, emptyProfile(), 2, { useModel: false });
    const big = review.candidates.find((c) => c.kind === "big_assignment")!;
    const pctMore = Math.round((big.meanRatio - 1) * 100);
    expect(whyNoteRejected(`In week 2, big assignments took about ${pctMore}% longer than planned.`, "big_assignment", review.candidates, 2)).toBeUndefined();
    expect(whyNoteRejected("Big assignments took 99% longer.", "big_assignment", review.candidates, 2)).toMatch(/99/);
  });

  it("refuses a note whose numbers are right but whose meaning is backwards", async () => {
    const { review } = await reviewWeek(student.sessions, emptyProfile(), 2, { useModel: false });
    const big = review.candidates.find((c) => c.kind === "big_assignment")!;
    const reading = review.candidates.find((c) => c.kind === "reading")!;
    expect(big.meanRatio).toBeGreaterThan(1);
    expect(whyNoteRejected(`Big assignments run ${big.meanRatio}x, consistent overestimation.`, "big_assignment", review.candidates, 2)).toMatch(/backwards|overestimation/);
    expect(whyNoteRejected(`Big assignments run ${big.meanRatio}x, so you underestimate them.`, "big_assignment", review.candidates, 2)).toBeUndefined();
    expect(reading.meanRatio).toBeLessThan(1);
    expect(whyNoteRejected(`Readings run ${reading.meanRatio}x, so you underestimate them.`, "reading", review.candidates, 2)).toMatch(/underestimation/);
  });
});

describe("notes about trends are checked against a trend the code computed", () => {
  const base = { kind: "assignment" as const, n: 8, meanRatio: 1.2, current: 1, target: 1.18, delta: 0.18, eligible: true, example: { title: "Homework 8", estimate: 45, actual: 54, week: 8 } };
  const wk = (...r: number[]) => r.map((ratio, i) => ({ week: i + 1, ratio, n: 1 }));
  const rising = { ...base, trend: "up" as const, weeklyRatio: wk(1.1, 1.15, 1.2, 1.3) };
  const flat = { ...base, trend: "flat" as const, weeklyRatio: wk(1.2, 1.21, 1.19, 1.2) };
  const early = { ...base, trend: "unclear" as const, weeklyRatio: wk(1.1, 1.3) };

  it("refuses a trend the data does not show, and one in the wrong direction", () => {
    expect(whyNoteRejected("Assignments are trending down, so you are getting faster.", "assignment", [flat], 8)).toMatch(/does not show \(it is flat\)/);
    expect(whyNoteRejected("Assignments are creeping up.", "assignment", [early], 2)).toMatch(/does not show \(it is unclear\)/);
    expect(whyNoteRejected("Assignment ratios have trended down from 1.1x to 1.3x.", "assignment", [rising], 4)).toMatch(/went up/);
  });
  it("accepts a trend in the direction the code found", () => {
    expect(whyNoteRejected("Assignment ratios are trending up, from 1.1x to 1.3x.", "assignment", [rising], 4)).toBeUndefined();
  });
  it("refuses weeks and sessions that do not match what was logged", () => {
    expect(whyNoteRejected("Assignments took 1.2x your estimate, now 8 weeks of data.", "assignment", [rising], 4)).toMatch(/weeks/);
    expect(whyNoteRejected("Assignments took 1.2x your estimate over 4 weeks.", "assignment", [rising], 4)).toBeUndefined();
    expect(whyNoteRejected("Assignments took 1.2x your estimate across 8 sessions.", "assignment", [rising], 4)).toBeUndefined();
    expect(whyNoteRejected("Assignments took 1.2x your estimate across 5 sessions.", "assignment", [rising], 4)).toMatch(/sessions/);
  });
  it("the code labels the trend from the weekly ratios", async () => {
    const s = syntheticStudent();
    const c = (await import("../learning")).weeklyCandidates(s.sessions, emptyProfile(), 8);
    expect(c.find((x) => x.kind === "big_assignment")!.trend).toBe("flat"); // stable by construction
    expect((await import("../learning")).weeklyCandidates(s.sessions, emptyProfile(), 2).every((x) => x.trend === "unclear")).toBe(true);
  });
});

describe("experiment: assignment time (rules arm, no model)", () => {
  it("beats both no learning and the app's current calibration, and finds the true factors", async () => {
    const x = await runExperiment("assignments", ["raw", "existing", "rules"]);
    const [raw, existing, rules] = x.arms;
    expect(rules.total.mae).toBeLessThan(raw.total.mae);
    expect(rules.total.mae).toBeLessThan(existing.total.mae);
    expect(rules.total.minutesShort).toBeLessThan(raw.total.minutesShort * 0.5);
    // Within 0.08 of the truth: shrinkage toward 1.0 and the sample's own noise account for the gap.
    for (const l of rules.learned!) expect(l.error).toBeLessThan(0.08);
    // The story: week 2's problem set was planned at 90 with no learning, and closer to 120 with it.
    expect(raw.story!.plan).toBe(90);
    expect(rules.story!.plan).toBeGreaterThan(105);
  });
});

describe("experiment: held-out student", () => {
  it("also beats no learning and the app's current calibration on a student it was not tuned on", async () => {
    const x = await runExperiment("assignments", ["raw", "existing", "rules"], { student: studentB() });
    const [raw, existing, rules] = x.arms;
    expect(x.student).toMatch(/held out/);
    expect(rules.total.mae).toBeLessThan(raw.total.mae * 0.6);
    expect(rules.total.mae).toBeLessThan(existing.total.mae);
    expect(rules.total.minutesShort).toBeLessThan(raw.total.minutesShort * 0.5);
  });
});
