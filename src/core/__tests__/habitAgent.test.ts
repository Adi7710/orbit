import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHabitProfile } from "../habits";
import { syntheticHistory } from "../habitSeed";

const nemotron = vi.fn();
vi.mock("../../agents/models", () => ({ nemotronJson: (...a: unknown[]) => nemotron(...a) }));
const { habitInsights } = await import("../../agents/habitAgent");

const p = buildHabitProfile(syntheticHistory(new Date("2026-09-22T17:00:00Z")));
const ev = (o: Record<string, number | string>) => Object.entries(o).map(([key, value]) => ({ key, value: String(value) }));
const reply = (insights: unknown[]) => nemotron.mockResolvedValue({ data: { insights }, provider: "nemotron-hosted", model: "m", latencyMs: 5 });

beforeEach(() => nemotron.mockReset());

describe("habit agent", () => {
  it("falls back to code-written insights when there is no key or the call fails", async () => {
    nemotron.mockResolvedValue({ data: { insights: [] }, provider: "heuristic", latencyMs: 0, error: "no NVIDIA_API_KEY" });
    const r = await habitInsights(p);
    expect(r.provider).toBe("heuristic");
    expect(r.insights.map((i) => i.kind)).toEqual(["best_window", "overrun", "deadline_style"]);
    expect(r.insights.every((i) => i.source === "rules")).toBe(true);
  });

  it("never calls the model when asked for rules only", async () => {
    const r = await habitInsights(p, { useModel: false });
    expect(nemotron).not.toHaveBeenCalled();
    expect(r.insights).toHaveLength(3);
  });

  it("keeps the model's wording when every number checks out", async () => {
    // Use the profile's own pace so the test does not hard-code a rounded number.
    const real = p.best!.pace;
    reply([{ kind: "best_window", text: `You're about ${Math.round((1 - real) * 100)}% quicker before noon.`, suggestion: "Save the hard stuff for a morning gap.", evidence: ev({ "best.bucket": "morning", "best.pace": Math.round(real * 100) / 100 }) }]);
    const r = await habitInsights(p);
    const best = r.insights.find((i) => i.kind === "best_window")!;
    expect(best.source).toBe("nemotron");
    expect(best.text).toMatch(/quicker before noon/);
    expect(r.rejected).toBe(0);
    // kinds the model skipped are filled in by code
    expect(r.insights.map((i) => i.source)).toEqual(["nemotron", "rules", "rules"]);
  });

  it("replaces an insight that cites a wrong number, and counts it", async () => {
    reply([{ kind: "overrun", text: "Graded work takes you 3x what you estimate.", suggestion: "Plan 200% more time.", evidence: ev({ "domain.build.meanRatio": 3 }) }]);
    const r = await habitInsights(p);
    const o = r.insights.find((i) => i.kind === "overrun")!;
    expect(o.source).toBe("rules");
    expect(o.text).not.toMatch(/\b3x/);
    expect(r.rejected).toBe(1);
  });

  it("rejects a true evidence entry paired with an invented number in the prose", async () => {
    reply([{ kind: "best_window", text: "You are 63% faster before noon.", suggestion: "Use mornings.", evidence: ev({ "best.bucket": "morning", "best.pace": Math.round(p.best!.pace * 100) / 100 }) }]);
    const r = await habitInsights(p);
    expect(r.insights[0].source).toBe("rules");
    expect(r.rejected).toBe(1);
  });

  it("rejects duplicate kinds and kinds the code has no draft for", async () => {
    reply([{ kind: "in_gap", text: "x", suggestion: "y", evidence: ev({ sessions: 33 }) }, { kind: "made_up", text: "x", suggestion: "y", evidence: ev({ sessions: 33 }) }]);
    const r = await habitInsights(p);
    expect(r.rejected).toBe(2);
    expect(r.insights.every((i) => i.source === "rules")).toBe(true);
  });
});
