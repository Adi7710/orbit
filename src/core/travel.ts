import type { PlaceId } from "./types";

export type CommuteMode = "walk" | "bike" | "bus";

/**
 * Undirected leg times between named places. Starts from a default per
 * commute mode and switches to the observed median after three trips, so a
 * wrong guess corrects itself instead of compounding.
 */
export class TravelGraph {
  private legs = new Map<string, number[]>();
  private defaults = new Map<string, number>();

  constructor(private mode: CommuteMode = "walk", private fallbackMinutes = 10) {}

  private key(a: PlaceId, b: PlaceId) {
    return [a, b].sort().join("|");
  }

  setDefault(a: PlaceId, b: PlaceId, minutes: number) {
    this.defaults.set(this.key(a, b), minutes);
  }

  record(a: PlaceId, b: PlaceId, minutes: number) {
    const k = this.key(a, b);
    this.legs.set(k, [...(this.legs.get(k) ?? []), minutes]);
  }

  minutes(a?: PlaceId, b?: PlaceId): number {
    if (!a || !b || a === b) return 0;
    const k = this.key(a, b);
    const obs = this.legs.get(k) ?? [];
    if (obs.length >= 3) {
      const s = [...obs].sort((x, y) => x - y);
      return s[Math.floor(s.length / 2)];
    }
    return this.defaults.get(k) ?? this.fallbackMinutes;
  }
}
