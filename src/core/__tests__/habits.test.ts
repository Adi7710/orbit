import { describe, expect, it } from "vitest";
import { buildHabitProfile, bucketOf, deterministicInsights, flattenStats, verifyInsight, type HabitRecord } from "../habits";
import { syntheticHistory } from "../habitSeed";

/** 2026-09-14 is a Monday. Times below are New York wall clock (EDT, UTC-4). */
const at = (day: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 8, day, hh + 4, mm));
const rec = (over: Partial<HabitRecord> & Pick<HabitRecord, "domain" | "plannedMinutes" | "actualMinutes" | "completedAt">): HabitRecord => ({ taskId: Math.random().toString(36), title: "t", inGap: true, ...over });

/**
 * Hand-computed dataset. Reading, estimate 40 min:
 *   3 sessions ending 11:42 taking 32 min (start 11:10, morning)  -> ratio 0.8
 *   3 sessions ending 20:22 taking 52 min (start 19:30, evening)  -> ratio 1.3
 *   reading mean ratio = (3*0.8 + 3*1.3) / 6 = 1.05
 *   pace = ratio / 1.05: morning 0.8/1.05 = 0.7619, evening 1.3/1.05 = 1.2381
 * Graded work, estimate 90, taking 90 (ratio 1.0), starting 13:00, due 4, 5 and 6 hours later
 *   -> median 5 hours before the deadline, "last-minute" (< 6 h).
 */
const reading = (day: number, hh: number, mm: number, actual: number) => rec({ domain: "learn", plannedMinutes: 40, actualMinutes: actual, completedAt: at(day, hh, mm) });
const data: HabitRecord[] = [
  reading(14, 11, 42, 32), reading(15, 11, 42, 32), reading(16, 11, 42, 32),
  reading(14, 20, 22, 52), reading(15, 20, 22, 52), reading(16, 20, 22, 52),
  ...[4, 5, 6].map((h, i) => rec({ domain: "build", plannedMinutes: 90, actualMinutes: 90, completedAt: at(14 + i, 14, 30), dueAt: new Date(at(14 + i, 14, 30).getTime() + h * 36e5) })),
];

describe("habit profile (hand-computed)", () => {
  const p = buildHabitProfile(data);

  it("buckets a session by when it started, not when it ended", () => {
    expect(bucketOf(at(14, 11, 42), 32)).toBe("morning");
    expect(bucketOf(at(14, 12, 10), 32)).toBe("morning"); // ended after noon, started 11:38
    expect(bucketOf(at(14, 20, 22), 52)).toBe("evening");
    expect(bucketOf(at(14, 0, 20), 60)).toBe("late"); // crossed midnight, started 23:20
  });

  it("counts sessions, days and the overall ratio", () => {
    expect(p.sessions).toBe(9);
    expect(p.activeDays).toBe(3);
    // (3*0.8 + 3*1.3 + 3*1.0) / 9 = 1.0333
    expect(p.overallRatio).toBeCloseTo(1.0333, 3);
  });

  it("measures pace against the same domain's own average", () => {
    const morning = p.byBucket.find((b) => b.bucket === "morning")!;
    const evening = p.byBucket.find((b) => b.bucket === "evening")!;
    expect(morning.meanRatio).toBeCloseTo(0.8, 5);
    expect(morning.pace).toBeCloseTo(0.7619, 4);
    expect(evening.pace).toBeCloseTo(1.2381, 4);
    expect(p.byDomain.find((d) => d.domain === "learn")!.meanRatio).toBeCloseTo(1.05, 5);
  });

  it("names the best and worst window only when they differ by at least 0.15", () => {
    expect(p.best?.bucket).toBe("morning");
    expect(p.worst?.bucket).toBe("evening");
    const flat = buildHabitProfile(data.map((r) => ({ ...r, actualMinutes: r.plannedMinutes })));
    expect(flat.best).toBeUndefined();
  });

  it("says nothing about a bucket with fewer than three sessions", () => {
    const thin = buildHabitProfile(data.filter((r, i) => i !== 0 && i !== 1)); // morning drops to 1 session
    expect(thin.best).toBeUndefined();
  });

  it("classifies how close to the deadline the student finishes", () => {
    expect(p.deadline).toEqual({ tasks: 3, medianHoursBefore: 5, style: "last-minute" });
  });

  it("ignores rows with no positive estimate or duration", () => {
    const junk = [...data, rec({ domain: "learn", plannedMinutes: 0, actualMinutes: 10, completedAt: at(14, 9) }), rec({ domain: "learn", plannedMinutes: 40, actualMinutes: NaN, completedAt: at(14, 9) })];
    expect(buildHabitProfile(junk).sessions).toBe(9);
  });
});

describe("insights", () => {
  const p = buildHabitProfile(data);

  it("writes a best-window insight whose numbers come from the profile", () => {
    const [best] = deterministicInsights(p);
    expect(best.kind).toBe("best_window");
    // 1 - 0.76 = 24% faster, 1.24 - 1 = 24% slower
    expect(best.text).toBe("You work about 24% faster before noon than your usual pace for the same kind of task, and about 24% slower between 5 and 10 PM.");
    expect(best.evidence).toEqual({ "best.bucket": "morning", "best.pace": 0.76, "worst.bucket": "evening", "worst.pace": 1.24 });
    expect(deterministicInsights(p).every((i) => verifyInsight(i, p))).toBe(true);
  });

  it("rejects an insight with a wrong number, an unknown key, or a number that is not in the evidence", () => {
    const [good] = deterministicInsights(p);
    expect(verifyInsight(good, p)).toBe(true);
    expect(verifyInsight({ ...good, evidence: { ...good.evidence, "best.pace": 0.5 } }, p)).toBe(false);
    expect(verifyInsight({ ...good, evidence: { "made.up": 1 } }, p)).toBe(false);
    expect(verifyInsight({ ...good, evidence: {} }, p)).toBe(false);
    expect(verifyInsight({ ...good, text: "You work 63% faster before noon." }, p)).toBe(false);
    expect(verifyInsight({ ...good, evidence: { ...good.evidence, "best.bucket": "evening" } }, p)).toBe(false);
  });

  it("exposes every cited stat under a stable key", () => {
    const f = flattenStats(p);
    expect(f["bucket.morning.pace"]).toBe(0.76);
    expect(f["deadline.style"]).toBe("last-minute");
    expect(f["domain.learn.meanRatio"]).toBe(1.05);
  });
});

describe("seeded synthetic history", () => {
  const h = syntheticHistory(new Date("2026-09-22T17:00:00Z"));
  const p = buildHabitProfile(h);

  it("is deterministic, flagged synthetic, and covers three weeks", () => {
    expect(JSON.stringify(syntheticHistory(new Date("2026-09-22T17:00:00Z")))).toBe(JSON.stringify(h));
    expect(h.every((r) => r.synthetic)).toBe(true);
    expect(h).toHaveLength(33); // 15 readings + 12 problem sets + 6 gym sessions
    expect(p.activeDays).toBe(21);
  });

  it("carries the planted patterns so the math has something to find", () => {
    expect(p.best?.bucket).toBe("morning");
    expect(p.worst?.bucket).toBe("evening");
    expect(p.byDomain.find((d) => d.domain === "build")!.meanRatio).toBeGreaterThan(1.4);
    expect(p.byDomain.find((d) => d.domain === "build")!.meanRatio).toBeLessThan(1.65);
    expect(p.deadline?.style).toBe("last-minute");
    const kinds = deterministicInsights(p).map((i) => i.kind);
    expect(kinds).toEqual(["best_window", "overrun", "deadline_style"]);
  });
});
