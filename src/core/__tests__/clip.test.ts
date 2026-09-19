import { describe, expect, it } from "vitest";
import { clipToNow, MIN_USABLE, type Gap } from "@/core/gaps";
import { t } from "@/core/time";

const gap = (start: number, end: number, over: Partial<Gap> = {}): Gap => ({
  id: `g${start}`, start, end, usable: end - start, isEvening: false, ...over,
});

/**
 * Windows have to move with the clock.
 *
 * The bug: the plan was written at wake and never touched again, so at seven
 * in the evening Orbit was still offering "your best window is eleven oh five,
 * three hours sixteen" -- a window that closed five hours earlier. Every
 * number in it had been correct that morning, which is the worst kind of
 * wrong, because it looks exactly like the truth.
 */
describe("clipping the day to the current minute", () => {
  const morning = gap(t(11, 5), t(14, 21));   // 196 minutes
  const evening = gap(t(15, 50), t(23, 44));  // 474 minutes

  it("drops a window that has already gone", () => {
    const out = clipToNow([morning, evening], t(19, 0));
    expect(out.map((g) => g.id)).not.toContain(morning.id);
  });

  it("shortens a window that is under way to what is actually left", () => {
    const out = clipToNow([morning, evening], t(19, 0));
    const live = out.find((g) => g.id === evening.id)!;
    expect(live.start).toBe(t(19, 0));
    expect(live.usable).toBe(t(23, 44) - t(19, 0)); // 284, not 474
    expect(live.inProgress).toBe(true);
  });

  it("keeps the id from the planned start, not the clipped one", () => {
    // A window that shrinks by a minute every minute is still the same window.
    // If its id moved with the clock, the Watcher would see one close and
    // another open on every single tick.
    const out = clipToNow([evening], t(19, 0));
    expect(out[0].id).toBe(evening.id);
    expect(out[0].plannedStart).toBe(t(15, 50));
  });

  it("leaves a window that has not started alone", () => {
    const out = clipToNow([evening], t(9, 0));
    expect(out[0]).toEqual(evening);
    expect(out[0].inProgress).toBeUndefined();
  });

  it("drops a window whose remainder is only a coffee", () => {
    const nearlyOver = gap(t(15, 0), t(19, 10));
    expect(clipToNow([nearlyOver], t(19, 0))).toHaveLength(0);
  });

  it("keeps a remainder that is exactly the minimum", () => {
    const g = gap(t(15, 0), t(19, 0) + MIN_USABLE);
    expect(clipToNow([g], t(19, 0))).toHaveLength(1);
  });

  it("returns the whole day when no clock is given", () => {
    // findGaps without `now` still plans the full day, which is what the
    // ledger and every existing test rely on.
    expect(clipToNow([morning, evening], 0)).toHaveLength(2);
  });
});
