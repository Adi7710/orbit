import { describe, expect, it } from "vitest";
import { bestStopPair, routesBetween, stopsNear, STOP } from "@/services/schedule";
import { BUILDINGS } from "@/lib/journey";

/**
 * Choosing where to get on and off, from the data.
 *
 * The board and alight stops used to be a hardcoded pair per building, which
 * meant a new location needed a code change and "somewhere on campus" was not
 * a question Orbit could answer at all.
 */
const WEEKDAY = "20260922"; // a Tuesday inside the extracted feed window

describe("finding stops near a point", () => {
  it("finds the stops around campus, nearest first", () => {
    const near = stopsNear(BUILDINGS.Cathedral, 1200);
    expect(near.length).toBeGreaterThan(1);
    expect(near[0].metres).toBeLessThanOrEqual(near[1].metres);
  });

  it("finds nothing in the middle of the ocean", () => {
    expect(stopsNear({ lat: 0, lon: 0 }, 1200)).toHaveLength(0);
  });
});

describe("proving a direction from the data instead of a stop's name", () => {
  it("finds routes that run campus to Squirrel Hill", () => {
    const routes = routesBetween(STOP.campusOutbound, STOP.homeOutbound, WEEKDAY);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => /^61/.test(r))).toBe(true);
  });

  it("returns nothing for the wrong direction on the same pair", () => {
    // A stop labelled "outbound" is only outbound relative to somewhere. The
    // pair that counts is the one a single trip serves board-then-alight, and
    // reversing it must not quietly still work.
    const forward = routesBetween(STOP.campusOutbound, STOP.homeOutbound, WEEKDAY);
    const backward = routesBetween(STOP.homeOutbound, STOP.campusOutbound, WEEKDAY);
    expect(forward.length).toBeGreaterThan(0);
    expect(backward).toHaveLength(0);
  });

  it("returns nothing for a stop paired with itself", () => {
    expect(routesBetween(STOP.campusOutbound, STOP.campusOutbound, WEEKDAY)).toHaveLength(0);
  });
});

describe("picking the pair for an arbitrary journey", () => {
  it("resolves home to campus without being told which stops", () => {
    const pair = bestStopPair(BUILDINGS.Home, BUILDINGS.Cathedral, WEEKDAY);
    expect(pair).toBeDefined();
    expect(pair!.routes.length).toBeGreaterThan(0);
    expect(pair!.boardId).not.toBe(pair!.alightId);
  });

  it("picks different stops for different destinations", () => {
    // The proof that this is the data choosing and not a table: Benedum and
    // Cathedral are served from different corners.
    const a = bestStopPair(BUILDINGS.Benedum, BUILDINGS.Home, WEEKDAY);
    const b = bestStopPair(BUILDINGS.Cathedral, BUILDINGS.Home, WEEKDAY);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.boardId).not.toBe(b!.boardId);
  });

  it("gives up rather than inventing a pair when nothing is in walking distance", () => {
    expect(bestStopPair({ lat: 0, lon: 0 }, BUILDINGS.Home, WEEKDAY)).toBeUndefined();
  });

  it("reports the walking distance at both ends so the caller can score it", () => {
    const pair = bestStopPair(BUILDINGS.Home, BUILDINGS.Cathedral, WEEKDAY)!;
    expect(pair.walkFrom).toBeGreaterThanOrEqual(0);
    expect(pair.walkTo).toBeGreaterThanOrEqual(0);
  });
});
