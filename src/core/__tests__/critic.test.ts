import { describe, expect, it, beforeEach } from "vitest";
import { criticReset, fallbackJudge, isMuted, record, rewardLedger, MUTE_AFTER, type Candidate, type Judgement } from "@/agents/critic";

const base: Candidate = {
  kind: "gap_grew",
  tier: "B",
  headline: "Your window grew by 569 minutes",
  evidence: "g665 went from 196 to 765 usable minutes",
  action: "Put Problem Set 4 in the 765-minute block at 11:05 and hold a room in Hillman",
  reasoning: "That cancellation joined two windows into one stretch of 765 minutes, and Problem Set 4 wants 90.",
};

const judgement = (overall: number): Judgement => ({
  scores: { grounded: 4, tierCorrect: 4, useful: 4, voice: 4 },
  overall,
  verdict: "keep",
  note: "test",
  provider: "heuristic",
  latencyMs: 0,
});

describe("the deterministic rubric, used when no model is reachable", () => {
  it("passes a decision whose numbers all come from the evidence", () => {
    const { scores } = fallbackJudge(base);
    expect(scores.grounded).toBeGreaterThanOrEqual(4);
    expect(scores.tierCorrect).toBe(4);
  });

  it("catches a number that appears nowhere in the evidence", () => {
    const { scores, note } = fallbackJudge({ ...base, action: "Put Problem Set 4 in the 4321-minute block" });
    expect(scores.grounded).toBeLessThan(4);
    expect(note).toContain("4321");
  });

  it("catches acting alone on something that leaves the app", () => {
    const { scores, note } = fallbackJudge({ ...base, tier: "A", action: "Booked a room in Hillman and messaged Sam" });
    expect(scores.tierCorrect).toBe(0);
    expect(note).toContain("acted alone");
  });

  it("does not punish asking first for the same thing", () => {
    expect(fallbackJudge({ ...base, tier: "B", action: "Hold a room in Hillman" }).scores.tierCorrect).toBe(4);
  });

  it("marks down lecturing", () => {
    const long = "You really should have planned this earlier! ".repeat(8);
    expect(fallbackJudge({ ...base, reasoning: long }).scores.voice).toBeLessThan(4);
  });
});

describe("the reward ledger", () => {
  beforeEach(() => criticReset());

  it("averages a behaviour's score over time", () => {
    record("gap_grew", judgement(4));
    record("gap_grew", judgement(2));
    const k = rewardLedger().kinds.find((x) => x.kind === "gap_grew")!;
    expect(k.n).toBe(2);
    expect(k.mean).toBe(3);
  });

  it("mutes a behaviour that keeps scoring badly, but only after enough evidence", () => {
    for (let i = 0; i < MUTE_AFTER - 1; i++) record("bus_slipped", judgement(1));
    expect(isMuted("bus_slipped")).toBe(false);
    record("bus_slipped", judgement(1));
    expect(isMuted("bus_slipped")).toBe(true);
  });

  it("leaves a behaviour that scores well alone", () => {
    for (let i = 0; i < 5; i++) record("gap_opened", judgement(4.5));
    expect(isMuted("gap_opened")).toBe(false);
  });

  it("sorts the worst behaviour to the top, which is where you want to look", () => {
    record("good", judgement(5));
    record("bad", judgement(1));
    expect(rewardLedger().kinds[0].kind).toBe("bad");
  });
});
