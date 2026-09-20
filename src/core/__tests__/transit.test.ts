import { describe, expect, it } from "vitest";
import { alertsFor, classify, type ServiceAlert } from "@/services/alerts";
import { confidenceOf } from "@/lib/journey";

/**
 * The transit layer's two honesty problems, pinned.
 *
 * Both came out of reading the live PRT feeds rather than the code: we were
 * fetching trip updates and vehicle positions and ignoring the alerts feed
 * entirely, and we were applying one scheduled ride time to every bus while
 * the feed was already predicting each one.
 */

const alert = (over: Partial<ServiceAlert> = {}): ServiceAlert => ({
  id: "a", header: "", effect: "OTHER", routes: [], stops: [], activeNow: true, movesTheStop: false, ...over,
});

describe("reading what PRT actually publishes", () => {
  it("recognises a stop move even though PRT files it as UNKNOWN_EFFECT", () => {
    // 19 of the 24 alerts on the feed carry no usable effect enum and put the
    // meaning in the title, so the text has to decide when the enum will not.
    for (const h of ["Temp. Stop Move: Forbes & Bouqet", "Temporary Stop discontinued I376", "New Bus stop locations"]) {
      const c = classify(undefined, h);
      expect(c.effect, h).toBe("STOP_MOVED");
      expect(c.movesTheStop, h).toBe(true);
    }
  });

  it("treats a detour as something that moves where you stand", () => {
    expect(classify(undefined, "Closure: West Lib & Belle Isle").movesTheStop).toBe(true);
  });

  it("reads PRT's shorthand for a route out of service", () => {
    expect(classify(undefined, "75 O/S").effect).toBe("NO_SERVICE");
  });

  it("does not turn an ordinary notice into a stop move", () => {
    expect(classify(undefined, "Rider survey open through Friday").movesTheStop).toBe(false);
  });
});

describe("which alerts belong to this trip", () => {
  const all = [
    alert({ id: "forbes", header: "Temp. Stop Move: Forbes & Bouqet", routes: ["61A", "61B", "61C", "61D", "28X"], effect: "STOP_MOVED", movesTheStop: true }),
    alert({ id: "elsewhere", header: "41 detour", routes: ["41"], effect: "DETOUR", movesTheStop: true }),
    alert({ id: "delay", header: "61C running late", routes: ["61C"], effect: "SIGNIFICANT_DELAYS" }),
    alert({ id: "expired", header: "Old news", routes: ["61A"], activeNow: false }),
  ];

  it("keeps what touches the route and drops the rest", () => {
    const got = alertsFor(all, ["61A", "61C"], ["7095"]).map((a) => a.id);
    expect(got).toContain("forbes");
    expect(got).toContain("delay");
    expect(got).not.toContain("elsewhere");
  });

  it("drops an alert that is not in force", () => {
    expect(alertsFor(all, ["61A"], []).map((a) => a.id)).not.toContain("expired");
  });

  it("puts what moves the stop first, because that is the one that makes us wrong", () => {
    // A delay makes the answer late. A stop move makes it false, and no
    // arrival prediction saves you from standing at the wrong pole.
    expect(alertsFor(all, ["61A", "61C"], [])[0].movesTheStop).toBe(true);
  });

  it("matches on a stop even when the route does not", () => {
    const stopOnly = [alert({ id: "s", header: "Stop closed", stops: ["7095"] })];
    expect(alertsFor(stopOnly, ["99X"], ["7095"]).map((a) => a.id)).toEqual(["s"]);
  });
});

describe("how much to trust a departure", () => {
  const near = { metersToStop: 800, ageSec: 20 };

  it("trusts a live trip with a fresh position close by", () => {
    expect(confidenceOf({ status: "live", vehicle: near, liveAlight: true, secondsAway: 600 })).toBe("high");
  });

  it("does not trust a stale position", () => {
    // A fix from five minutes ago is not a live one.
    expect(confidenceOf({ status: "live", vehicle: { metersToStop: 800, ageSec: 300 }, liveAlight: false, secondsAway: 600 })).toBe("medium");
  });

  it("does not trust a bus that is still far away", () => {
    expect(confidenceOf({ status: "live", vehicle: { metersToStop: 9000, ageSec: 10 }, liveAlight: false, secondsAway: 3000 })).toBe("medium");
  });

  it("is honest that a distant timetable entry is a guess", () => {
    expect(confidenceOf({ status: "scheduled", liveAlight: false, secondsAway: 50 * 60 })).toBe("low");
    expect(confidenceOf({ status: "scheduled", liveAlight: false, secondsAway: 10 * 60 })).toBe("medium");
  });

  it("never claims confidence in a ghost", () => {
    // A trip that should be on the road and is absent from the feed is the
    // least trustworthy thing we can show.
    expect(confidenceOf({ status: "ghost", vehicle: near, liveAlight: true, secondsAway: 300 })).toBe("low");
  });
});
