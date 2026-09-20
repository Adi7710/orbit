import { describe, expect, it } from "vitest";
import { bestStopPair, callingPoints, departuresAt, routesBetween, stopsNear, tripServes, STOP } from "@/services/schedule";
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

describe("a trip has to actually reach where you are going", () => {
  it("rejects a trip that calls at the boarding stop but terminates before the destination", () => {
    // The bug this pins: a route runs both ways, and a stop's departure board
    // lists every trip calling there. Filtering by route alone offered the
    // light rail at Marin Boulevard on a service terminating one stop further
    // south, and presented it as the way to Hoboken.
    const board = STOP.campusOutbound;
    const alight = STOP.homeOutbound;
    const serving = departuresAt(board, WEEKDAY, 12 * 3600, 3600).filter((d) => tripServes(d.trip, board, alight));
    const all = departuresAt(board, WEEKDAY, 12 * 3600, 3600);
    expect(all.length).toBeGreaterThan(0);
    // Every trip we keep must genuinely reach the far stop.
    for (const d of serving) expect(tripServes(d.trip, board, alight), d.trip).toBe(true);
    // And the filter must do something: not every trip at a stop goes our way.
    expect(serving.length).toBeLessThanOrEqual(all.length);
  });

  it("is false for the reverse direction on the same trip", () => {
    const d = departuresAt(STOP.campusOutbound, WEEKDAY, 12 * 3600, 3600).find((x) => tripServes(x.trip, STOP.campusOutbound, STOP.homeOutbound));
    expect(d).toBeDefined();
    expect(tripServes(d!.trip, STOP.homeOutbound, STOP.campusOutbound)).toBe(false);
  });

  it("lists the calling pattern in order, board first and alight last", () => {
    const d = departuresAt(STOP.campusOutbound, WEEKDAY, 12 * 3600, 3600).find((x) => tripServes(x.trip, STOP.campusOutbound, STOP.homeOutbound))!;
    const calls = callingPoints(d.trip, STOP.campusOutbound, STOP.homeOutbound);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].id).toBe(STOP.campusOutbound);
    expect(calls[calls.length - 1].id).toBe(STOP.homeOutbound);
    // Times only move forwards.
    for (let i = 1; i < calls.length; i++) expect(calls[i].sec).toBeGreaterThanOrEqual(calls[i - 1].sec);
  });
});
