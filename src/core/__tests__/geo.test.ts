import { describe, expect, it } from "vitest";
import { decodePolyline, haversineMeters, nearestIndex, pathMeters, walkMinutes } from "../geo";

describe("geo", () => {
  const cathedral = { lat: 40.4443, lon: -79.9532 };
  const forbesBigelow = { lat: 40.443052, lon: -79.953835 };
  const murray = { lat: 40.4372, lon: -79.923 };

  it("measures short campus walks sensibly", () => {
    const m = haversineMeters(cathedral, forbesBigelow);
    expect(m).toBeGreaterThan(100);
    expect(m).toBeLessThan(200);
    expect(walkMinutes(cathedral, forbesBigelow)).toBeLessThanOrEqual(3);
  });

  it("knows Squirrel Hill is a real walk", () => {
    expect(haversineMeters(cathedral, murray)).toBeGreaterThan(2500);
    expect(walkMinutes(cathedral, murray)).toBeGreaterThan(30);
  });

  it("decodes Google polylines", () => {
    // Google's documented example.
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(38.5, 3);
    expect(pts[0][1]).toBeCloseTo(-120.2, 3);
  });

  it("finds the nearest vertex and measures along the line", () => {
    const line: [number, number][] = [[40.4430, -79.9538], [40.4400, -79.9450], [40.4380, -79.9300], [40.4372, -79.9230]];
    expect(nearestIndex(line, forbesBigelow)).toBe(0);
    expect(nearestIndex(line, murray)).toBe(3);
    const along = pathMeters(line, 0, 3);
    expect(along).toBeGreaterThan(haversineMeters(forbesBigelow, murray));
  });
});
