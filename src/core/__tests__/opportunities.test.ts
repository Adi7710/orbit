import { describe, expect, it } from "vitest";
import { growthPlan, recommendOpportunities, OPPORTUNITIES } from "../opportunities";

const now = new Date(2026, 8, 20, 10, 0);

describe("the world outside the timetable", () => {
  it("drops what is past and what is beyond the horizon, and ranks the rest", () => {
    const recs = recommendOpportunities({ now, queuedMinutes: 300, usableMinutes: 600 });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.inDays).toBeGreaterThanOrEqual(-r.opportunity.days);
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].fit).toBeGreaterThanOrEqual(recs[i].fit);
    expect(recommendOpportunities({ now, queuedMinutes: 0, usableMinutes: 1, horizonDays: 1 })).toEqual([]);
  });

  it("prefers short events on a full week, and says so with the hours", () => {
    const recs = recommendOpportunities({ now, queuedMinutes: 900, usableMinutes: 600 });
    const shortOnes = recs.filter((r) => r.opportunity.hours <= 15);
    expect(shortOnes.length).toBeGreaterThan(0);
    expect(shortOnes[0].reason).toMatch(/hours and your week is already full/);
  });

  it("budgets more hours when the student runs long on that domain", () => {
    const recs = recommendOpportunities({ now, queuedMinutes: 100, usableMinutes: 600, domainMultiplier: { build: 1.6 } });
    const build = recs.find((r) => r.opportunity.domain === "build")!;
    expect(build.reason).toMatch(/runs about 60% longer/);
    expect(build.reason).toMatch(new RegExp(`budget ${Math.round(build.opportunity.hours * 1.6)} hours`));
  });

  it("writes a growth plan of at most four lines, numbers first, no feelings", () => {
    const lines = growthPlan({ now, queuedMinutes: 540, usableMinutes: 600, domainMultiplier: { build: 1.37 }, bestTime: "morning" }, [
      { aspect: "work_length", sentence: "big assignments take you about 37% longer than you think." },
    ]);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines[0]).toMatch(/^Plan 37% more time for build work/);
    expect(lines.join(" ")).toMatch(/90% booked/);
    expect(lines.join(" ")).not.toMatch(/!/);
  });

  it("every listing is flagged synthetic", () => {
    for (const o of OPPORTUNITIES) expect(o.synthetic).toBe(true);
  });
});
