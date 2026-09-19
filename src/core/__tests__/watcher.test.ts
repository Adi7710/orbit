import { describe, expect, it } from "vitest";
import { diff, type Snapshot } from "@/agents/watcher";

const base: Snapshot = {
  at: 0,
  gapIds: ["g665", "g950"],
  gapMinutes: { g665: 196, g950: 474 },
  inProgress: [],
  picks: { g665: "ps4", g950: "essay" },
  slack: 165,
  overCommitted: false,
  busLeaveBy: 949,
  busRoute: "61D",
  busStatus: "live",
  classCount: 3,
  openTaskIds: ["ps4", "essay", "gym"],
  urgentUnplanned: [],
  mode: "normal",
};
const after = (p: Partial<Snapshot>): Snapshot => ({ ...base, ...p });
const kinds = (s: Snapshot) => diff(base, s).map((e) => e.kind);

describe("what the Watcher notices", () => {
  it("says nothing when nothing changed", () => {
    expect(diff(base, base)).toEqual([]);
  });

  it("notices a class coming off the calendar", () => {
    expect(kinds(after({ classCount: 2 }))).toContain("class_removed");
  });

  it("notices a window opening, growing, shrinking and closing", () => {
    expect(kinds(after({ gapIds: ["g665", "g950", "g515"], gapMinutes: { ...base.gapMinutes, g515: 85 } }))).toContain("gap_opened");
    expect(kinds(after({ gapMinutes: { ...base.gapMinutes, g665: 765 } }))).toContain("gap_grew");
    expect(kinds(after({ gapMinutes: { ...base.gapMinutes, g665: 85 } }))).toContain("gap_shrank");
    expect(kinds(after({ gapIds: ["g665"], gapMinutes: { g665: 196 } }))).toContain("gap_closed");
  });

  it("ignores noise of five minutes or less, so it does not chatter", () => {
    expect(kinds(after({ gapMinutes: { ...base.gapMinutes, g665: 192 } }))).toEqual([]);
    expect(kinds(after({ gapMinutes: { ...base.gapMinutes, g665: 200 } }))).toEqual([]);
    expect(kinds(after({ busLeaveBy: 947 }))).toEqual([]);
  });

  it("only raises the bus when you must leave EARLIER, never later", () => {
    expect(kinds(after({ busLeaveBy: 943 }))).toContain("bus_slipped");
    expect(kinds(after({ busLeaveBy: 960 }))).not.toContain("bus_slipped");
  });

  it("notices the day stopping and starting to fit", () => {
    expect(kinds(after({ slack: -120, overCommitted: true }))).toContain("now_overcommitted");
    expect(diff(after({ slack: -120, overCommitted: true }), base).map((e) => e.kind)).toContain("now_fits");
  });

  it("raises a deadline that has nowhere to happen, once", () => {
    const urgent = after({ urgentUnplanned: ["essay"] });
    expect(kinds(urgent)).toContain("deadline_unplanned");
    // Already raised: the same state on the next tick must stay quiet.
    expect(diff(urgent, urgent)).toEqual([]);
  });

  it("carries the evidence that triggered it, so the trace can answer why", () => {
    const [e] = diff(base, after({ gapMinutes: { ...base.gapMinutes, g665: 765 } }));
    expect(e.evidence).toContain("196");
    expect(e.evidence).toContain("765");
    expect(e.gapId).toBe("g665");
  });
});

describe("the clock moving is not an event", () => {
  it("does not report a window shrinking just because time passed", () => {
    // A window already under way loses a minute every minute. Before this, the
    // Watcher announced "your window lost 6 minutes" roughly every six
    // minutes, for ever, which is both wrong and the fastest way to make
    // someone stop reading the trace.
    const before: Snapshot = { ...base, at: 0, inProgress: ["g950"], gapMinutes: { g665: 196, g950: 474 } };
    const after: Snapshot = { ...before, at: 10 * 60_000, gapMinutes: { g665: 196, g950: 464 } };
    expect(diff(before, after).filter((e) => e.kind === "gap_shrank")).toHaveLength(0);
  });

  it("still reports a real loss on top of the drift", () => {
    // Ten minutes passed, but the window lost forty: a class landed in it.
    const before: Snapshot = { ...base, at: 0, inProgress: ["g950"], gapMinutes: { g665: 196, g950: 474 } };
    const after: Snapshot = { ...before, at: 10 * 60_000, gapMinutes: { g665: 196, g950: 434 } };
    const [e] = diff(before, after).filter((x) => x.kind === "gap_shrank");
    expect(e).toBeDefined();
    expect(e.headline).toContain("30");            // 40 lost, 10 of it the clock
    expect(e.evidence).toContain("just time passing");
  });

  it("does not apply drift to a window that has not started", () => {
    const before: Snapshot = { ...base, at: 0, inProgress: [], gapMinutes: { g665: 196, g950: 474 } };
    const after: Snapshot = { ...before, at: 10 * 60_000, gapMinutes: { g665: 196, g950: 464 } };
    expect(diff(before, after).filter((e) => e.kind === "gap_shrank")).toHaveLength(1);
  });
});
