import { describe, expect, it } from "vitest";
import { transitNeed, DEFAULT_LEAD_MINUTES, HOME_TAIL_MINUTES } from "@/core/transitRelevance";
import { compactDuration } from "@/core/say";
import { t } from "@/core/time";
import type { FixedBlock } from "@/core/types";

const block = (id: string, start: number, end: number, place?: string): FixedBlock =>
  ({ id, title: id, start, end, place, kind: "class" } as FixedBlock);

/**
 * When a bus is worth working out at all.
 *
 * Orbit used to solve a journey on every load of Today, which meant three
 * protobuf feeds fetched and a route computed for a student on their sofa with
 * nothing on until Thursday. That is wasted work against a public agency's
 * servers, latency on the screen that has to be instant, and a bus card at a
 * moment when a bus answers nothing.
 */
describe("deciding whether to plan a bus", () => {
  const classAtTwo = block("c1", t(14, 0), t(15, 20), "Cathedral");

  it("plans nothing when the next class is hours away", () => {
    const need = transitNeed({ nowMin: t(9, 0), blocks: [classAtTwo] });
    expect(need.needed).toBe(false);
    expect(need.reason).toBe("idle");
  });

  it("starts planning once the class is inside the lead time", () => {
    const need = transitNeed({ nowMin: t(14, 0) - DEFAULT_LEAD_MINUTES + 5, blocks: [classAtTwo] });
    expect(need.needed).toBe(true);
    expect(need.reason).toBe("class");
    expect(need.to).toBe("Cathedral");
    expect(need.block?.id).toBe("c1");
  });

  it("explains itself rather than showing an empty card", () => {
    // A client should never have to guess whether transit is broken or idle.
    const need = transitNeed({ nowMin: t(9, 0), blocks: [classAtTwo] });
    expect(need.why).toMatch(/Nothing to catch yet/);
    expect(need.why).toContain("c1");
  });

  it("offers the way home after the last class, for a while", () => {
    const need = transitNeed({ nowMin: t(15, 40), blocks: [classAtTwo] });
    expect(need.needed).toBe(true);
    expect(need.reason).toBe("home");
  });

  it("stops offering the way home eventually", () => {
    const need = transitNeed({ nowMin: t(15, 20) + HOME_TAIL_MINUTES + 10, blocks: [classAtTwo] });
    expect(need.needed).toBe(false);
  });

  it("plans nothing on a day with no classes at all", () => {
    const need = transitNeed({ nowMin: t(13, 0), blocks: [] });
    expect(need.needed).toBe(false);
    expect(need.why).toMatch(/no bus to work out/);
  });

  it("always answers when the student asked, whatever the clock says", () => {
    // If they picked a place, they want the answer. Nine in the morning with
    // nothing on is exactly when someone plans an errand.
    const need = transitNeed({ nowMin: t(9, 0), blocks: [classAtTwo], askedFor: "Hillman" });
    expect(need.needed).toBe(true);
    expect(need.reason).toBe("asked");
    expect(need.to).toBe("Hillman");
  });

  it("ignores a block with no place, since there is nowhere to travel to", () => {
    const need = transitNeed({ nowMin: t(13, 30), blocks: [block("study", t(14, 0), t(15, 0), undefined)] });
    expect(need.needed).toBe(false);
  });

  it("takes the soonest class, not the first one in the list", () => {
    const later = block("c2", t(16, 0), t(17, 0), "Posvar");
    const need = transitNeed({ nowMin: t(13, 30), blocks: [later, classAtTwo] });
    expect(need.block?.id).toBe("c1");
  });
});

describe("durations past an hour say hours", () => {
  it("keeps minutes under an hour", () => {
    expect(compactDuration(13)).toBe("13 min");
    expect(compactDuration(59)).toBe("59 min");
  });

  it("switches to hours at sixty, which is the bug this fixes", () => {
    // "Leave in 75 min" and "ride 94 min" are arithmetic handed to someone
    // glancing at a phone while walking.
    expect(compactDuration(60)).toBe("1h");
    expect(compactDuration(75)).toBe("1h 15m");
    expect(compactDuration(94)).toBe("1h 34m");
    expect(compactDuration(120)).toBe("2h");
  });

  it("never renders a negative duration", () => {
    expect(compactDuration(-5)).toBe("0 min");
  });
});
