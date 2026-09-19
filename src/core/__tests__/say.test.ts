import { describe, expect, it } from "vitest";
import { countThings, greetingWord, naturalClock, naturalDue, naturalDuration, partOfDay } from "@/core/say";
import { t } from "@/core/time";

/**
 * Saying things the way a person says them.
 *
 * Adi's note: "no butler would say there are four hours forty-four minutes
 * left". The rule that the server composes every sentence with a number in it
 * is unchanged -- what changed is that the composed sentence now sounds like
 * someone who knows your schedule rather than a stopwatch reading itself out.
 */
describe("durations", () => {
  it("rounds to what a person would actually say", () => {
    expect(naturalDuration(144)).toBe("about two and a half hours");
    expect(naturalDuration(60)).toBe("about an hour");
    expect(naturalDuration(90)).toBe("about an hour and a half");
    expect(naturalDuration(120)).toBe("about two hours");
  });

  it("says half and three quarters of an hour rather than counting minutes", () => {
    expect(naturalDuration(30)).toBe("about half an hour");
    expect(naturalDuration(45)).toBe("about three quarters of an hour");
  });

  it("uses 'just over' and 'nearly' instead of a quarter-hour fraction", () => {
    expect(naturalDuration(135)).toBe("just over two hours");
    expect(naturalDuration(165)).toBe("nearly three hours");
  });

  it("never claims more precision than it has", () => {
    // Everything above twenty minutes is hedged, because it is rounded.
    for (const m of [30, 45, 90, 144, 281]) {
      expect(naturalDuration(m), String(m)).toMatch(/^(about|just over|nearly)/);
    }
  });
});

describe("clock times, softly", () => {
  it("names the quarter hours", () => {
    expect(naturalClock(t(23, 0))).toBe("eleven");
    expect(naturalClock(t(23, 15))).toBe("quarter past eleven");
    expect(naturalClock(t(23, 30))).toBe("half past eleven");
    expect(naturalClock(t(23, 45))).toBe("quarter to midnight");
  });

  it("knows midnight and noon by name", () => {
    expect(naturalClock(t(0, 0))).toBe("midnight");
    expect(naturalClock(t(12, 0))).toBe("noon");
  });

  it("handles a wind-down past midnight without wrapping to a negative hour", () => {
    // sleepStart may exceed 1440; 24:30 is half past midnight, not half past zero.
    expect(naturalClock(t(24, 30))).toBe("half past midnight");
  });
});

describe("the shape of what is left", () => {
  it("names the part of the day", () => {
    expect(partOfDay(t(9, 0))).toBe("the morning");
    expect(partOfDay(t(14, 0))).toBe("the afternoon");
    expect(partOfDay(t(19, 0))).toBe("the evening");
  });

  it("avoids 'Evening, Adi. You have the evening'", () => {
    expect(greetingWord(t(19, 0))).toBe("Evening");
    expect(partOfDay(t(19, 0), true)).toBe("the rest of tonight");
  });
});

describe("counting and deadlines the way they are spoken", () => {
  it("spells small counts and keeps the singular", () => {
    expect(countThings(1)).toBe("one thing");
    expect(countThings(8)).toBe("eight things");
    expect(countThings(0)).toBe("no things");
  });

  it("says due dates relative to now", () => {
    const now = new Date("2026-09-19T19:00:00-04:00");
    expect(naturalDue(new Date("2026-09-19T23:59:00-04:00"), now)).toBe("due tonight");
    expect(naturalDue(new Date("2026-09-20T23:59:00-04:00"), now)).toBe("due tomorrow");
    expect(naturalDue(new Date("2026-09-21T23:59:00-04:00"), now)).toBe("due Monday");
  });

  it("does not hide an overdue task behind a friendly phrase", () => {
    const now = new Date("2026-09-19T19:00:00-04:00");
    expect(naturalDue(new Date("2026-09-17T23:59:00-04:00"), now)).toBe("already overdue");
  });

  it("returns nothing when there is no deadline, rather than inventing one", () => {
    expect(naturalDue(undefined)).toBeUndefined();
  });
});
