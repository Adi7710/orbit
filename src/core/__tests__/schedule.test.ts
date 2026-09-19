import { describe, expect, it } from "vitest";
import { activeServices, departuresAt, rideMinutes, ymd, STOP, isFeedValid } from "@/services/schedule";
import { clock } from "@/services/prt";

describe("PRT schedule slice", () => {
  it("resolves service ids with calendar_dates exceptions", () => {
    expect(activeServices("20260922").has("2")).toBe(true); // Tuesday: weekday service
    expect(activeServices("20260922").has("4")).toBe(false); // Monday-only service not on Tuesday
    expect(activeServices("20260907").has("2")).toBe(false); // Labor Day: weekday service removed
    expect(activeServices("20260907").has("4")).toBe(true); // Labor Day: holiday service added
    expect(activeServices("20260920").has("5")).toBe(true); // Sunday
    expect(activeServices("20260919").has("1")).toBe(false); // this Saturday: service 1 removed by exception
    expect(activeServices("20260919").has("3")).toBe(true);
  });

  it("lists weekday departures at the Cathedral outbound stop around 13:00", () => {
    const d = departuresAt(STOP.campusOutbound, "20260922", 13 * 3600, 30 * 60);
    expect(d.length).toBeGreaterThan(10);
    expect(d.every((x) => x.sec >= 13 * 3600 && x.sec <= 13.5 * 3600)).toBe(true);
    expect(new Set(d.map((x) => x.route))).toContain("61C");
    expect(new Set(d.map((x) => x.route))).toContain("71B");
  });

  it("filters by route and knows the ride from campus to Squirrel Hill", () => {
    const d = departuresAt(STOP.campusOutbound, "20260922", 17 * 3600, 20 * 60, ["61A", "61B", "61C", "61D"]);
    expect(d.every((x) => x.route.startsWith("61"))).toBe(true);
    const ride = rideMinutes(STOP.campusOutbound, STOP.homeOutbound, "20260922", 17 * 3600);
    expect(ride).toBeGreaterThan(5);
    expect(ride).toBeLessThan(30);
  });

  it("knows the feed validity window", () => {
    expect(isFeedValid("20260922")).toBe(true);
    expect(isFeedValid("20261101")).toBe(false);
    expect(ymd(new Date("2026-09-22T16:00:00Z"))).toBe("20260922");
  });

  it("pins the clock in demo mode", () => {
    process.env.DEMO_CLOCK = "2026-09-22T13:10";
    const c = clock();
    expect(c).toMatchObject({ ymd: "20260922", sec: 13 * 3600 + 600, simulated: true });
    delete process.env.DEMO_CLOCK;
    expect(clock().simulated).toBe(false);
  });
});
