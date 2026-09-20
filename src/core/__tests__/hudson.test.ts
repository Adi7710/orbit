import { describe, expect, it } from "vitest";
import hudson from "../../../data/njt-hudson.json";

/**
 * The Jersey City / Hoboken slice, checked against its own data.
 *
 * The rest of the transit suite runs against Pittsburgh, because that is what
 * its stop ids and ride times are pinned to and moving cities should not
 * delete a regression suite. This file covers the slice the app actually ships
 * with, and it deliberately reads the JSON rather than going through the
 * region switch, so it tests the data instead of the wiring.
 */

interface Stop { id: string; name: string; lat: number; lon: number; agency: string }
interface Dep { stop: string; trip: string; route: string; sec: number; seq: number }
const data = hudson as unknown as {
  feed: { feed_start_date: string; feed_end_date: string };
  stops: Record<string, Stop>;
  routes: { short: string; agency: string }[];
  departures: Dep[];
};

const stops = Object.values(data.stops);
const hoboken = stops.filter((s) => /HOBOKEN/.test(s.name));
const jerseyCity = stops.filter((s) => /EXCHANGE PLACE|HARBORSIDE|NEWPORT|GROVE|ESSEX|MARIN|JERSEY AVE|JOURNAL/.test(s.name));

describe("the Hudson County slice holds the commute", () => {
  it("has both agencies, because the commute genuinely uses both", () => {
    const agencies = new Set(stops.map((s) => s.agency));
    expect(agencies.has("NJT")).toBe(true);   // Hudson-Bergen Light Rail
    expect(agencies.has("PATH")).toBe(true);
  });

  it("knows Hoboken, which is where every trip to Stevens ends", () => {
    expect(hoboken.length).toBeGreaterThan(0);
  });

  it("knows the Jersey City stops a student would start from", () => {
    expect(jerseyCity.length).toBeGreaterThan(3);
  });

  it("covers today", () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(today >= data.feed.feed_start_date).toBe(true);
    expect(today <= data.feed.feed_end_date).toBe(true);
  });
});

describe("every stop is real and reachable", () => {
  it("places every stop in Hudson County, not somewhere else in New Jersey", () => {
    // Filtering stops by name alone kept a GROVE STREET twenty kilometres away
    // in Montclair, which has no light rail departures but which stopsNear()
    // would have happily offered as somewhere to walk. Stops are now dropped
    // unless a kept trip serves them; this pins that they are all local.
    for (const s of stops) {
      expect(s.lat, `${s.name} latitude`).toBeGreaterThan(40.6);
      expect(s.lat, `${s.name} latitude`).toBeLessThan(40.79);
      expect(s.lon, `${s.name} longitude`).toBeGreaterThan(-74.12);
      expect(s.lon, `${s.name} longitude`).toBeLessThan(-73.99);
    }
  });

  it("has no stop that nothing serves", () => {
    const served = new Set(data.departures.map((d) => d.stop));
    for (const s of stops) expect(served.has(s.id), `${s.name} has no departures`).toBe(true);
  });
});

describe("you can actually get from Jersey City to Hoboken", () => {
  /** Does one trip call at `from` and then later at `to`? */
  const servedBy = (from: Stop[], to: Stop[]) => {
    const toIds = new Set(to.map((s) => s.id));
    const fromIds = new Set(from.map((s) => s.id));
    const byTrip = new Map<string, Dep[]>();
    for (const d of data.departures) {
      if (!fromIds.has(d.stop) && !toIds.has(d.stop)) continue;
      (byTrip.get(d.trip) ?? byTrip.set(d.trip, []).get(d.trip)!).push(d);
    }
    const routes = new Set<string>();
    for (const legs of byTrip.values()) {
      for (const a of legs) {
        if (!fromIds.has(a.stop)) continue;
        if (legs.some((b) => toIds.has(b.stop) && b.seq > a.seq)) routes.add(a.route);
      }
    }
    return routes;
  };

  it("finds at least one route running Jersey City to Hoboken", () => {
    const routes = servedBy(jerseyCity, hoboken);
    expect(routes.size).toBeGreaterThan(0);
  });

  it("finds the way back too", () => {
    expect(servedBy(hoboken, jerseyCity).size).toBeGreaterThan(0);
  });

  it("runs often enough to be a commute, not a curiosity", () => {
    // Hundreds of departures a day across the two agencies, or something is
    // wrong with the extract rather than with New Jersey.
    expect(data.departures.length).toBeGreaterThan(5000);
  });
});
