import { describe, expect, it } from "vitest";
import { haversineMeters, scheduledPosition } from "../geo";

// Marin Boulevard to Hoboken Terminal, roughly, as a four-point line.
const shape: [number, number][] = [
  [40.7144, -74.0432],
  [40.7215, -74.0375],
  [40.7290, -74.0322],
  [40.7349, -74.0290],
];
const departs = 13 * 3600 + 47 * 60;
const alights = departs + 16 * 60;

describe("where the timetable says the train is", () => {
  it("sits at the boarding stop at departure and at the alighting stop at arrival", () => {
    const start = scheduledPosition(shape, departs, alights, departs)!;
    expect(haversineMeters(start, { lat: shape[0][0], lon: shape[0][1] })).toBeLessThan(5);
    const end = scheduledPosition(shape, departs, alights, alights)!;
    expect(haversineMeters(end, { lat: shape[3][0], lon: shape[3][1] })).toBeLessThan(5);
    expect(end.progress).toBe(1);
  });

  it("is part way along the line mid-ride, heading along it", () => {
    const mid = scheduledPosition(shape, departs, alights, departs + 8 * 60)!;
    expect(mid.progress).toBeCloseTo(0.5, 1);
    const fromStart = haversineMeters(mid, { lat: shape[0][0], lon: shape[0][1] });
    const total = haversineMeters({ lat: shape[0][0], lon: shape[0][1] }, { lat: shape[3][0], lon: shape[3][1] });
    expect(fromStart).toBeGreaterThan(total * 0.3);
    expect(fromStart).toBeLessThan(total * 0.7);
    expect(mid.bearing).toBeGreaterThan(0);
    expect(mid.bearing).toBeLessThan(90); // north-east up the Hudson
  });

  it("approaches the boarding stop before departure, closer as the minute nears, capped", () => {
    const far = scheduledPosition(shape, departs, alights, departs - 10 * 60)!;
    const near = scheduledPosition(shape, departs, alights, departs - 60)!;
    const dFar = haversineMeters(far, { lat: shape[0][0], lon: shape[0][1] });
    const dNear = haversineMeters(near, { lat: shape[0][0], lon: shape[0][1] });
    expect(dNear).toBeLessThan(dFar);
    expect(dFar).toBeLessThanOrEqual(1500 + 5);
    expect(dNear).toBeCloseTo(12 * 60, -2);
    expect(far.progress).toBe(0);
  });

  it("has nothing to say about a line with fewer than two points", () => {
    expect(scheduledPosition([[40, -74]], departs, alights, departs)).toBeUndefined();
  });
});
