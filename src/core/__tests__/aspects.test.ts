import { beforeEach, describe, expect, it } from "vitest";
import { ASPECTS, DEFAULTS, aspectIds, bucketOfSession, gapBand, specFor, type LearningInput, type WeeklyObservation } from "../aspects";
import type { HabitRecord } from "../habits";
import { reset, store } from "../../lib/store";
import {
  OFFER_FLOOR, buildLearningInput, currentWeek, deadlineRisk, factor, isActive,
  knownUsers, learned, learnedFacts, planningMinutes, resetLearned, reviewWeek, weekIndex, worthOffering, worthProposing,
} from "../../lib/learned";

const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 8, day, hour + 4));
const rec = (o: Partial<HabitRecord> & Pick<HabitRecord, "title" | "plannedMinutes" | "actualMinutes">): HabitRecord => ({
  taskId: o.title, domain: "build", completedAt: at(14), inGap: true, ...o,
});
const empty: LearningInput = { habits: [] };

beforeEach(() => { reset(); resetLearned(); });

describe("the registry is well formed", () => {
  it("has a usable spec for every aspect", () => {
    expect(aspectIds().length).toBeGreaterThanOrEqual(10);
    for (const [id, def] of Object.entries(ASPECTS)) {
      expect(def.spec.id, id).toBe(id);
      expect(def.label.length, id).toBeGreaterThan(0);
      expect(def.effect.length, id).toBeGreaterThan(0);
      expect(def.spec.brief.length, id).toBeGreaterThan(40);
      expect(def.minObservations, id).toBeGreaterThan(0);
      // Every declared category must be describable, or the model gets a bare id.
      for (const c of def.spec.categories) expect(def.spec.categoryLabel[c], `${id}.${c}`).toBeTruthy();
      // An aspect with no fixed categories must learn them from the data.
      if (def.spec.categories.length === 0) expect(def.spec.global ?? def.spec.clamp, id).toBeTruthy();
    }
  });

  it("collects nothing, and throws nothing, when the app has recorded nothing", () => {
    for (const [id, def] of Object.entries(ASPECTS)) {
      expect(() => def.collect(empty), id).not.toThrow();
      expect(def.collect(empty), id).toEqual([]);
    }
  });

  it("only ever produces observations with a positive baseline", () => {
    const i: LearningInput = {
      habits: [rec({ title: "Problem Set 1", plannedMinutes: 90, actualMinutes: 120, courseCode: "MATH 0220", dueAt: at(15), startedHoursBeforeDue: 4, meta: { gapMinutes: 60 } })],
      walks: [{ week: 1, leg: "A->B", plannedMinutes: 10, actualMinutes: 8 }],
      overheads: [{ week: 1, kind: "settle", plannedMinutes: 5, actualMinutes: 9 }, { week: 1, kind: "meal", plannedMinutes: 35, actualMinutes: 41 }],
      exams: [{ week: 1, kind: "quiz", totalStudyMinutes: 120, cramMinutes: 90, cramShare: 0.75, lastNightGapMinutes: 60 }],
      proposals: [{ week: 1, kind: "move_task", approved: true }, { week: 1, kind: "move_task", approved: false }],
      scheduled: [{ week: 1, domain: "body", offered: 4, done: 1 }],
    };
    let total = 0;
    for (const [id, def] of Object.entries(ASPECTS)) {
      for (const o of def.collect(i)) {
        expect(o.estimate, `${id} ${o.label}`).toBeGreaterThan(0);
        expect(Number.isFinite(o.actual), `${id} ${o.label}`).toBe(true);
        expect(def.spec.categories.length === 0 || def.spec.categories.includes(o.category), `${id} ${o.category}`).toBe(true);
        total++;
      }
    }
    // Every aspect found its signal in that one week.
    expect(total).toBeGreaterThanOrEqual(9);
  });

  it("learns categories from the data when none are declared up front", () => {
    const obs = [{ label: "x", category: "MATH 0220", estimate: 1, actual: 1, week: 1 }] as WeeklyObservation[];
    expect(specFor("course_load", obs).categories).toEqual(["MATH 0220"]);
    expect(specFor("work_length", obs).categories).toContain("big_assignment");
  });

  it("buckets a session by when it started and bands a gap by size", () => {
    expect(bucketOfSession(rec({ title: "t", plannedMinutes: 30, actualMinutes: 30, completedAt: at(14, 12) }))).toBe("morning");
    expect(bucketOfSession(rec({ title: "t", plannedMinutes: 30, actualMinutes: 60, completedAt: at(14, 21) }))).toBe("evening"); // finished 21:00, started 20:00
    expect(bucketOfSession(rec({ title: "t", plannedMinutes: 30, actualMinutes: 60, completedAt: at(14, 23) }))).toBe("late");
    expect([gapBand(30), gapBand(60), gapBand(200)]).toEqual(["short", "medium", "long"]);
  });
});

describe("a student the app knows nothing about is unaffected", () => {
  it("returns the app's own numbers and changes no behaviour", () => {
    store().habits = [];
    expect(factor("work_length", "big_assignment")).toBe(1);
    expect(isActive("work_length")).toBe(false);
    const task = { id: "a", title: "Essay draft", domain: "build" as const, estimateMinutes: 180, source: "manual" as const };
    expect(planningMinutes(task)).toBe(180);
    expect(deadlineRisk({ ...task, dueAt: at(20) })).toBeUndefined();
    expect(worthOffering("body")).toBe(true);
    expect(worthProposing("draft_extension")).toBe(true);
  });
});

describe("the weekly review", () => {
  const weekOf = (n: number) => at(7 + n * 7);
  function seedWeeks() {
    const s = store();
    s.habits = [];
    for (let w = 1; w <= 3; w++) {
      for (const [title, est, mult] of [["Problem Set", 90, 1.4], ["Homework", 45, 1.0], ["Reading: Chapter", 40, 0.8]] as const) {
        s.habits.push(rec({ title: `${title} ${w}`, plannedMinutes: est, actualMinutes: Math.round(est * mult), completedAt: weekOf(w), courseCode: "MATH 0220" }));
      }
    }
    resetLearned();
    learned().epoch = weekOf(1).toISOString();
  }

  it("activates only the aspects that have evidence, and reports the rest honestly", async () => {
    seedWeeks();
    const r = await reviewWeek(2, { useModel: false });
    const byId = new Map(r.aspects.map((a) => [a.id, a]));
    expect(byId.get("work_length")!.observations).toBeGreaterThan(0);
    expect(byId.get("walking")!.observations).toBe(0);
    expect(byId.get("walking")!.active).toBe(false);
    // Nothing anywhere threw; every aspect reported.
    expect(r.aspects).toHaveLength(aspectIds().length);
    expect(r.aspects.every((a) => !a.error)).toBe(true);
  });

  it("learns that big assignments run long, and plans more time for them", async () => {
    seedWeeks();
    await reviewWeek(1, { useModel: false });
    await reviewWeek(2, { useModel: false });
    expect(isActive("work_length")).toBe(true);
    expect(factor("work_length", "big_assignment")).toBeGreaterThan(1.05);
    const ps = { id: "ps", title: "Problem Set 9", domain: "build" as const, estimateMinutes: 90, source: "manual" as const };
    expect(planningMinutes(ps)).toBeGreaterThan(95);
  });

  it("does not count the same correction twice across layered aspects", async () => {
    seedWeeks();
    for (let w = 1; w <= 3; w++) await reviewWeek(w, { useModel: false });
    // Every session is MATH 0220, so the course has no residual of its own once
    // the kind of work is accounted for.
    const course = factor("course_load", "MATH 0220");
    expect(Math.abs(course - 1)).toBeLessThan(0.25);
    const ps = { id: "ps", title: "Problem Set 9", domain: "build" as const, estimateMinutes: 90, courseCode: "MATH 0220", source: "manual" as const };
    // 90 x 1.4 = 126 is the truth; double counting would push it far past that.
    expect(planningMinutes(ps)).toBeLessThan(150);
  });

  it("is safe to run the same week twice", async () => {
    seedWeeks();
    await reviewWeek(2, { useModel: false });
    const once = JSON.stringify(learned().aspects.work_length.memory.multipliers);
    await reviewWeek(2, { useModel: false });
    const twice = JSON.stringify(learned().aspects.work_length.memory.multipliers);
    expect(learned().lastReviewedWeek).toBe(2);
    // Re-reading the same evidence must not compound it.
    const a = Object.values(JSON.parse(once))[0] as number;
    const b = Object.values(JSON.parse(twice))[0] as number;
    expect(Math.abs(b - a)).toBeLessThan(0.2);
  });

  it("survives an aspect whose collector throws", async () => {
    seedWeeks();
    const original = ASPECTS.meals.collect;
    ASPECTS.meals.collect = () => { throw new Error("bad data"); };
    try {
      const r = await reviewWeek(2, { useModel: false });
      expect(r.aspects.find((a) => a.id === "meals")!.error).toMatch(/bad data/);
      expect(r.aspects.find((a) => a.id === "work_length")!.observations).toBeGreaterThan(0);
    } finally {
      ASPECTS.meals.collect = original;
    }
  });
});

describe("what the app does with what it learned", () => {
  it("stops offering what this person never finishes, and stops suggesting what they decline", () => {
    const l = learned();
    l.aspects.follow_through = { memory: { week: 2, multipliers: { body: 0.1, build: 0.9 }, evidence: {}, memos: [] }, observations: 5, active: true, lastReviewedWeek: 2, lessons: [] };
    l.aspects.proposal_fit = { memory: { week: 2, multipliers: { draft_extension: 0.05, move_task: 0.9 }, evidence: {}, memos: [] }, observations: 5, active: true, lastReviewedWeek: 2, lessons: [] };
    expect(worthOffering("body")).toBe(false);
    expect(worthOffering("build")).toBe(true);
    expect(worthProposing("draft_extension")).toBe(false);
    expect(worthProposing("move_task")).toBe(true);
    expect(OFFER_FLOOR).toBeGreaterThan(0);
  });

  it("only calls a deadline at risk once it knows both when they start and how long the work takes", () => {
    const l = learned();
    const task = { id: "t", title: "Essay draft", domain: "build" as const, estimateMinutes: 180, dueAt: at(20), source: "manual" as const };
    expect(deadlineRisk(task)).toBeUndefined();
    // Starts 0.15 x 12h = 1.8h before it is due, but the work needs 3 hours.
    l.aspects.procrastination = { memory: { week: 2, multipliers: { big_assignment: 0.15 }, evidence: {}, memos: [] }, observations: 5, active: true, lastReviewedWeek: 2, lessons: [] };
    const r = deadlineRisk(task)!;
    expect(r.startsInHours).toBeCloseTo(1.8, 1);
    expect(r.needsMinutes).toBe(180);
    expect(r.atRisk).toBe(true);
  });

  it("writes every sentence so it cannot disagree with its own number", () => {
    const l = learned();
    l.aspects.work_length = { memory: { week: 2, multipliers: { big_assignment: 1.4, assignment: 0.7 }, evidence: {}, memos: [] }, observations: 5, active: true, lastReviewedWeek: 2, lessons: [] };
    const facts = learnedFacts();
    const over = facts.find((f) => f.category === "big_assignment")!;
    const under = facts.find((f) => f.category === "assignment")!;
    expect(over.sentence).toMatch(/longer/);
    expect(over.sentence).not.toMatch(/less|quick/);
    expect(under.sentence).toMatch(/less/);
    expect(under.sentence).not.toMatch(/longer/);
    // The direction of the words always follows the number, for every aspect.
    for (const f of facts) {
      if (f.multiplier > 1) expect(f.sentence, f.aspect).not.toMatch(/\bfaster\b|\bunder\b/);
      if (f.multiplier < 1) expect(f.sentence, f.aspect).not.toMatch(/\bslower\b|\blonger\b/);
    }
  });

  it("says nothing about a correction too small to matter", () => {
    learned().aspects.work_length = { memory: { week: 2, multipliers: { big_assignment: 1.01 }, evidence: {}, memos: [] }, observations: 5, active: true, lastReviewedWeek: 2, lessons: [] };
    expect(learnedFacts()).toHaveLength(0);
  });
});

describe("weeks and evidence", () => {
  it("counts weeks from the first thing the app ever recorded", () => {
    const epoch = at(1);
    expect(weekIndex(at(1), epoch)).toBe(1);
    expect(weekIndex(at(7), epoch)).toBe(1);
    expect(weekIndex(at(8), epoch)).toBe(2);
    expect(weekIndex(at(22), epoch)).toBe(4);
    expect(currentWeek()).toBeGreaterThanOrEqual(1);
  });

  it("builds evidence out of what the live app already records", () => {
    const s = store();
    s.proposals = [
      { id: "1", proposal: { kind: "move_task", taskId: "a", gapId: "g", reason: "" }, status: "approved", createdAt: at(14).toISOString(), resolvedAt: at(14).toISOString() },
      { id: "2", proposal: { kind: "move_task", taskId: "b", gapId: "g", reason: "" }, status: "declined", createdAt: at(14).toISOString(), resolvedAt: at(14).toISOString() },
      { id: "3", proposal: { kind: "book_room", gapId: "g", building: "Hillman", reason: "" }, status: "pending", createdAt: at(14).toISOString() },
    ];
    const input = buildLearningInput();
    expect(input.proposals).toHaveLength(2); // the pending one is not evidence
    const fit = ASPECTS.proposal_fit.collect(input);
    expect(fit).toHaveLength(1);
    expect(fit[0]).toMatchObject({ category: "move_task", estimate: DEFAULTS.rate, actual: 0.5 });
  });
});

describe("learning is personal, and never a constant", () => {
  const weekOf = (n: number) => at(7 + n * 7);
  /** Same tasks, same estimates, two different people. */
  function seedPerson(userId: string, mult: number) {
    const s = store();
    s.user.id = userId;
    s.habits = [];
    for (let w = 1; w <= 3; w++) {
      s.habits.push(rec({ title: `Problem Set ${w}`, plannedMinutes: 90, actualMinutes: Math.round(90 * mult), completedAt: weekOf(w) }));
      s.habits.push(rec({ title: `Essay draft ${w}`, plannedMinutes: 150, actualMinutes: Math.round(150 * mult), completedAt: weekOf(w) }));
    }
    resetLearned(userId);
    learned(userId).epoch = weekOf(1).toISOString();
  }

  it("gives two people different numbers from the same tasks, and keeps them apart", async () => {
    resetLearned();
    seedPerson("maya", 1.4);
    for (let w = 1; w <= 3; w++) await reviewWeek(w, { useModel: false });
    const mayaFactor = factor("work_length", "big_assignment");
    const mayaPlan = planningMinutes({ id: "x", title: "Problem Set 9", domain: "build", estimateMinutes: 90, source: "manual" });
    const mayaSaid = learnedFacts()[0].sentence;

    seedPerson("jordan", 0.75);
    for (let w = 1; w <= 3; w++) await reviewWeek(w, { useModel: false });
    const jordanFactor = factor("work_length", "big_assignment");
    const jordanPlan = planningMinutes({ id: "x", title: "Problem Set 9", domain: "build", estimateMinutes: 90, source: "manual" });
    const jordanSaid = learnedFacts()[0].sentence;

    // One runs long, the other runs short. Nothing about this is fixed.
    expect(mayaFactor).toBeGreaterThan(1.1);
    expect(jordanFactor).toBeLessThan(0.95);
    expect(mayaPlan).toBeGreaterThan(jordanPlan + 20);
    expect(mayaSaid).toMatch(/longer/);
    expect(jordanSaid).toMatch(/less/);
    expect(mayaSaid).not.toBe(jordanSaid);

    // Maya's profile is untouched by anything Jordan did.
    expect(knownUsers().sort()).toEqual(["jordan", "maya"]);
    expect(learned("maya").aspects.work_length.memory.multipliers.big_assignment).toBeCloseTo(mayaFactor, 5);
    store().user.id = "maya";
    expect(factor("work_length", "big_assignment")).toBeCloseTo(mayaFactor, 5);
  });

  it("settles instead of inflating when the same week is reviewed over and over", async () => {
    resetLearned();
    seedPerson("drifty", 1.4);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      await reviewWeek(2, { useModel: false });
      seen.push(factor("work_length", "big_assignment"));
    }
    // It converges on what the week actually said (1.4x) and stops there.
    expect(seen.at(-1)!).toBeLessThanOrEqual(1.45);
    expect(seen.at(-1)!).toBeGreaterThan(1.0);
    // Every step moves toward the evidence, never past it.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 0.001 + Math.max(0, 1.4 - seen[i - 1]));
    expect(Math.abs(seen.at(-1)! - seen.at(-2)!)).toBeLessThan(0.05);
  });
});
