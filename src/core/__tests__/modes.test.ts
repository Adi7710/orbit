import { describe, expect, it } from "vitest";
import { bestFit, findGaps, MIN_USABLE } from "../gaps";
import { assignQuestsForMode, MODE_CONFIG, modeConfig, DEFAULT_MODE } from "../modes";
import {
  assignWorkBlocks, availableMinutesBefore, computeFeasibility, computeSlack,
  deadlinesFromTasks, deadlinesWithinHorizon, draftExtensionRequest, rankDeadlines, type Deadline,
} from "../deadlines";
import { Estimator } from "../estimator";
import { blocks, profile, tasks, travel } from "./fixture";
import type { Gap } from "../gaps";

const NOW = 9 * 60;
const gapsFor = (min: number) => findGaps(blocks, profile, travel, NOW, min);

describe("Normal reproduces the day Orbit already builds", () => {
  it("uses Orbit's own MIN_USABLE, not a number borrowed from another app", () => {
    expect(MODE_CONFIG.normal.minUsableGap).toBe(MIN_USABLE);
  });

  it("places exactly the tasks the original greedy assignment placed", () => {
    // Main's assignment, written out here rather than imported, so this test
    // fails if either side drifts: walk the day in order and let each window
    // choose from what the earlier ones left. This is the parity guard -- if
    // the mode work changes what Normal does, demo beat 2 changes with it.
    const gaps = findGaps(blocks, profile, travel, NOW);
    const estimator = new Estimator();
    const original = new Map<string, ReturnType<typeof bestFit>>();
    const used = new Set<string>();
    for (const g of gaps) {
      const t = bestFit(g, tasks.filter((x) => !used.has(x.id)), estimator);
      original.set(g.id, t);
      if (t) used.add(t.id);
    }

    const { picks, optional } = assignQuestsForMode(gaps, tasks, MODE_CONFIG.normal, (g, c) => bestFit(g, c, estimator));
    expect([...picks.entries()].map(([id, t]) => [id, t?.id])).toEqual([...original.entries()].map(([id, t]) => [id, t?.id]));
    expect(optional).toBe(false);
  });

  it("falls back to Normal for an unknown mode rather than throwing on a bad payload", () => {
    expect(modeConfig("nonsense" as never).id).toBe(DEFAULT_MODE);
  });
});

describe("each mode counts a different window as real", () => {
  it("Chill ignores windows Normal would use, and Crisis uses windows Normal would not", () => {
    const chill = gapsFor(MODE_CONFIG.chill.minUsableGap);
    const normal = gapsFor(MODE_CONFIG.normal.minUsableGap);
    const crisis = gapsFor(MODE_CONFIG.crisis.minUsableGap);
    expect(chill.every((g) => g.usable >= 40)).toBe(true);
    expect(crisis.every((g) => g.usable >= 12)).toBe(true);
    expect(chill.length).toBeLessThanOrEqual(normal.length);
    expect(normal.length).toBeLessThanOrEqual(crisis.length);
  });
});

describe("quest placement by strategy", () => {
  const gaps = gapsFor(MODE_CONFIG.normal.minUsableGap);

  it("Chill places one optional thing, and it goes in the biggest window", () => {
    const { picks, optional } = assignQuestsForMode(gaps, tasks, MODE_CONFIG.chill);
    const placed = [...picks.entries()].filter(([, t]) => t);
    expect(placed).toHaveLength(1);
    expect(optional).toBe(true);
    const biggest = [...gaps].sort((a, b) => b.usable - a.usable)[0];
    expect(placed[0][0]).toBe(biggest.id);
  });

  it("Crisis places no template quests at all, because the deadlines do it", () => {
    const { picks } = assignQuestsForMode(gaps, tasks, MODE_CONFIG.crisis);
    expect([...picks.values()].filter(Boolean)).toHaveLength(0);
  });

  it("never offers the same task in two windows", () => {
    const { picks } = assignQuestsForMode(gaps, tasks, MODE_CONFIG.normal);
    const ids = [...picks.values()].filter(Boolean).map((t) => t!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("deadline arithmetic", () => {
  const midnight = new Date("2026-09-22T00:00:00-04:00");
  const gaps: Gap[] = [
    { id: "g1", start: 600, end: 700, usable: 100, isEvening: false },  // 100 min
    { id: "g2", start: 800, end: 860, usable: 60, isEvening: false },   // 60 min
    { id: "g3", start: 1100, end: 1280, usable: 180, isEvening: true }, // 180 min
  ];
  const d = (id: string, due: number, effort: number): Deadline =>
    ({ id, title: id, due, estimatedEffortMin: effort, remainingEffortMin: effort });

  it("counts only the minutes between now and the deadline", () => {
    expect(availableMinutesBefore(gaps, 600, 1280)).toBe(340);
    expect(availableMinutesBefore(gaps, 650, 860)).toBe(110);   // 50 of g1 + 60 of g2
    expect(availableMinutesBefore(gaps, 600, 640)).toBe(40);    // part of one window
    expect(availableMinutesBefore(gaps, 1400, 1500)).toBe(0);   // the day is over
  });

  it("slack is what is left after the work, and goes negative when it cannot fit", () => {
    expect(computeSlack(d("a", 860, 100), gaps, 600)).toBe(60);
    expect(computeSlack(d("b", 860, 200), gaps, 600)).toBe(-40);
  });

  it("ranks the tightest first, not the soonest", () => {
    const soonButEasy = d("soon", 700, 10);
    const laterButTight = d("later", 1280, 330);
    expect(rankDeadlines([soonButEasy, laterButTight], gaps, 600).map((x) => x.id)).toEqual(["later", "soon"]);
  });

  it("compounds: two things that each fit alone may not fit together", () => {
    const a = d("a", 1280, 200), b = d("b", 1280, 200);
    expect(computeSlack(a, gaps, 600)).toBe(140);   // alone, it fits
    expect(computeSlack(b, gaps, 600)).toBe(140);   // alone, it fits
    const f = computeFeasibility([a, b], gaps, 600);
    expect(f.needMin).toBe(400);
    expect(f.haveMin).toBe(340);
    expect(f.shortfallMin).toBe(60);
    expect(f.deadlines.map((v) => v.fits)).toEqual([true, false]);
  });

  it("says so plainly when everything fits", () => {
    const f = computeFeasibility([d("a", 1280, 100)], gaps, 600);
    expect(f.shortfallMin).toBe(0);
    expect(f.message).toContain("fit");
  });

  it("splits work across consecutive windows and never past the due time", () => {
    const blocksOut = assignWorkBlocks([d("essay", 860, 130)], gaps, 600, 12);
    expect(blocksOut.map((b) => [b.gapId, b.minutes])).toEqual([["g1", 100], ["g2", 30]]);
    expect(blocksOut.at(-1)!.completes).toBe(true);
    expect(blocksOut.every((b) => b.end <= 860)).toBe(true);
  });

  it("refuses windows below the mode's threshold", () => {
    const tiny: Gap[] = [{ id: "t", start: 600, end: 615, usable: 15, isEvening: false }];
    expect(assignWorkBlocks([d("a", 1280, 60)], tiny, 600, 40)).toHaveLength(0);
    expect(assignWorkBlocks([d("a", 1280, 60)], tiny, 600, 12)).toHaveLength(1);
  });

  it("reads deadlines off real tasks using the calibrated estimate, not the raw one", () => {
    const estimator = new Estimator();
    const out = deadlinesFromTasks(tasks, midnight, estimator);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((x) => x.remainingEffortMin === estimator.planningMinutes(tasks.find((t) => t.id === x.id)!))).toBe(true);
    // a task with no due date is work, not a deadline
    expect(out.find((x) => x.id === "gym")).toBeUndefined();
  });

  it("honours Chill's 72-hour horizon", () => {
    const near = d("near", 60 * 24, 30), far = d("far", 60 * 24 * 5, 30);
    expect(deadlinesWithinHorizon([near, far], 0, 72).map((x) => x.id)).toEqual(["near"]);
    expect(deadlinesWithinHorizon([near, far], 0, null)).toHaveLength(2);
  });

  it("drafts an extension request without sending anything", () => {
    const text = draftExtensionRequest(d("Essay draft", 1280, 180), 120, "Adi");
    expect(text).toContain("2 hours short");
    expect(text).toContain("Adi");
  });
});
