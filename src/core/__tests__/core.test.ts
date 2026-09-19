import { describe, expect, it } from "vitest";
import { blocks, profile, tasks, travel } from "./fixture";
import { computeLedger, suggestCuts } from "../ledger";
import { bestFit, betweenClassMinutes, findGaps } from "../gaps";
import { t, fmt } from "../time";
import { Estimator, heuristicMinutes } from "../estimator";
import { courseCode, parseIcs, blocksOn, occursOn, placeFromLocation } from "../ics";
import { rankBoard, xpFor } from "../game";
import { sharedGaps } from "../overlap";
import { ghostTrips, leaveBy } from "../bus";

describe("capacity ledger (hand-computed Tuesday)", () => {
  const ledger = computeLedger(blocks, profile, travel, []);
  it("counts the day honestly", () => {
    expect(ledger.awake).toBe(990);
    expect(ledger.fixed).toBe(175);
    expect(ledger.travel).toBe(46);
    expect(ledger.meals).toBe(115);
    expect(ledger.routines).toBe(65);
    expect(ledger.usable).toBe(589);
  });
  it("shows the naive number the calendar would claim", () => {
    expect(ledger.naiveFree).toBe(815); // 13h35m of 'free' time that is really 9h49m
    expect(ledger.naiveFree - ledger.usable).toBe(226);
  });
  it("suggests cuts when over-committed", () => {
    const over = computeLedger(blocks, profile, travel, [...tasks, { id: "x", title: "Big project", domain: "build", estimateMinutes: 400, source: "manual" }]);
    expect(over.overCommitted).toBe(true);
    const cuts = suggestCuts([...tasks, { id: "x", title: "Big project", domain: "build", estimateMinutes: 400, source: "manual" }], -over.slack, new Set(["build"]));
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts[0].task.id).toBe("gym"); // unprotected, no deadline, biggest first among those
  });
});

describe("gap finder", () => {
  const gaps = findGaps(blocks, profile, travel);
  it("finds exactly two usable windows", () => {
    expect(gaps.map((g) => [fmt(g.start), fmt(g.end), g.usable])).toEqual([
      ["11:05", "14:21", 196],
      ["15:50", "23:44", 474],
    ]);
  });
  it("throws away the coffee-sized holes", () => {
    // 08:35-09:05 is 30 min but 16 after the walk; 09:55-10:10 is 3 after walk+settle.
    expect(gaps.find((g) => g.start === t(8, 35))).toBeUndefined();
    expect(betweenClassMinutes(gaps)).toBe(196);
  });
  it("offers one task per gap, priority then deadline then size", () => {
    const pick = bestFit(gaps[0], tasks);
    expect(pick?.id).toBe("ps4"); // has a deadline, fits in 196
    const small = { ...gaps[0], usable: 45, end: gaps[0].start + 45 };
    expect(bestFit(small, tasks)?.id).toBe("read");
  });
});

describe("estimator", () => {
  it("needs five samples and trims outliers", () => {
    const e = new Estimator();
    for (const a of [90, 95, 100, 92, 300]) e.record("MATH 0220", "build", 60, a);
    expect(e.multiplier("MATH 0220", "build")).toBeCloseTo(95.67 / 60, 1);
    expect(e.multiplier("CS 0441", "build")).toBe(1);
  });
  it("caps at 3x", () => {
    const e = new Estimator();
    for (let i = 0; i < 5; i++) e.record(undefined, "learn", 10, 100);
    expect(e.multiplier(undefined, "learn")).toBe(3);
  });
  it("guesses from titles", () => {
    expect(heuristicMinutes("Problem Set 4")).toBe(90);
    expect(heuristicMinutes("Midterm 1")).toBe(240);
  });
});

describe("ics parser", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:cs0441",
    "SUMMARY:CS 0441 - Discrete Structures",
    "LOCATION:Sennott Square 5502",
    "DTSTART;TZID=America/New_York:20260825T090500",
    "DTEND;TZID=America/New_York:20260825T095500",
    "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261211T045959Z",
    "EXDATE;TZID=America/New_York:20261126T090500",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:ps4",
    "SUMMARY:Problem Set 4 [MATH 0220]",
    "DTSTART;VALUE=DATE:20260924",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = parseIcs(ics);
  it("reads recurrence, exclusions and course codes", () => {
    expect(events).toHaveLength(2);
    expect(courseCode(events[0].summary)).toBe("CS 0441");
    expect(courseCode(events[1].summary)).toBe("MATH 0220");
    expect(placeFromLocation(events[0].location)).toBe("Sennott");
    expect(occursOn(events[0], new Date(2026, 8, 22))).toBe(true); // a Tuesday
    expect(occursOn(events[0], new Date(2026, 8, 23))).toBe(false); // Wednesday
    expect(occursOn(events[0], new Date(2026, 10, 26))).toBe(false); // Thanksgiving excluded
  });
  it("produces fixed blocks for a day", () => {
    const b = blocksOn(new Date(2026, 8, 22), events, "America/New_York");
    expect(b).toHaveLength(1);
    expect([b[0].start, b[0].end]).toEqual([t(9, 5), t(9, 55)]);
  });
});

describe("gamification", () => {
  it("rewards honest, in-gap, on-time work and caps it", () => {
    const task = tasks[0];
    const gap = findGaps(blocks, profile, travel)[0];
    const good = xpFor({ task, actualMinutes: 90, plannedMinutes: 90, completedInGap: gap, completedAt: new Date() }, "normal", 2);
    expect(good.xp).toBeGreaterThan(100);
    expect(good.xp).toBeLessThanOrEqual(150);
    const lie = xpFor({ task, actualMinutes: 5, plannedMinutes: 90, completedAt: new Date() }, "normal", 0);
    expect(lie.xp).toBeLessThan(30);
    expect(xpFor({ task, actualMinutes: 90, plannedMinutes: 90, completedAt: new Date() }, "crisis", 0).xp).toBe(0);
  });
  it("ranks a weekly board", () => {
    const board = rankBoard([
      { userId: "a", name: "A", xpWeek: 300, streakWeeks: 1, ringsClosed: 3, group: "Tower A" },
      { userId: "b", name: "B", xpWeek: 300, streakWeeks: 4, ringsClosed: 5, group: "Tower A" },
      { userId: "c", name: "C", xpWeek: 900, streakWeeks: 0, ringsClosed: 1, group: "Tower B" },
    ]);
    expect(board.map((r) => r.userId)).toEqual(["c", "b", "a"]);
    expect(rankBoard(board, "Tower A")[0].userId).toBe("b");
  });
});

describe("social overlap", () => {
  it("finds shared free windows without exposing classes", () => {
    const mine = findGaps(blocks, profile, travel);
    const friend = { userId: "f1", name: "Sam", sharesFreeTime: true, gaps: [{ id: "g", start: t(12, 0), end: t(13, 0), usable: 60, isEvening: false }] };
    const hidden = { ...friend, userId: "f2", sharesFreeTime: false };
    const ov = sharedGaps(mine, [friend, hidden]);
    expect(ov).toHaveLength(1);
    expect(ov[0]).toMatchObject({ start: t(12, 0), end: t(13, 0), userIds: ["f1"] });
  });
});

describe("bus", () => {
  it("tells you when to stand up and skips ghosts", () => {
    const arrivals = [
      { route: "61C", stopId: "s1", arrivalMinutes: t(14, 5), realtime: false },
      { route: "71B", stopId: "s1", arrivalMinutes: t(14, 8), realtime: true },
    ];
    const lb = leaveBy(t(13, 50), 6, arrivals, t(14, 30), 12);
    expect(lb?.route).toBe("71B");
    expect(lb?.leaveBy).toBe(t(14, 0));
    expect(ghostTrips(arrivals, arrivals.filter((a) => a.realtime))).toHaveLength(1);
  });
});
