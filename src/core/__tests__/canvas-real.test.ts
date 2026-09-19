import { describe, expect, it } from "vitest";
import { bracketName, codeFromText, courseCode, isClassMeeting, resolveCourseCodes } from "@/core/ics";
import { heuristicMinutes } from "@/core/estimator";

/**
 * Pinned against the shapes in a real Canvas feed.
 *
 * Everything here was a bug found by importing an actual student's calendar,
 * not by imagining one. The synthetic sample passed happily while all three of
 * these were broken, which is the argument for testing against real data
 * shapes even when the data itself stays out of the repo.
 *
 * No feed URL or personal content appears in this file. These are title
 * patterns, and a Canvas feed URL is a credential.
 */

// Exactly as Canvas writes them, including its double spaces.
const MEETINGS = [
  "2026F FE 570-A [Market Microstructure and Trading Strategies]",
  "2026F FE 621-WS [Computational Methods in Finance]",
  "2026F MGT 808-WS Tuesday Class [Fundamentals of Consulting]",
  "2025S MGT 808-WS1 FUNDAMENTALS OF CONSULTING [Fundamentals of Consulting]",
];

const WORK = [
  "Case Study: Deloitte & Touche (1 student) [Fundamentals of Consulting]",
  "Week 4 - Consulting Legend - Barbara Minto [Fundamentals of Consulting]",
  "ManageMentor Module: Presentation Skills [Fundamentals of Consulting]",
  "Student Video Introduction [Fundamentals of Consulting]",
  "Week 1 - Consulting Legend: Peter Drucker (2026F MGT 808-WS) [Fundamentals of Consulting]",
];

describe("telling a class meeting apart from a piece of work", () => {
  it("recognises every meeting shape in the feed", () => {
    for (const m of MEETINGS) expect(isClassMeeting(m), m).toBe(true);
  });

  it("does not mistake an assignment for a meeting", () => {
    for (const w of WORK) expect(isClassMeeting(w), w).toBe(false);
  });

  it("is not fooled by a course code sitting mid-title", () => {
    // This one carries "2026F MGT 808-WS" inside parentheses but is a post.
    expect(isClassMeeting("Week 1 - Consulting Legend: Peter Drucker (2026F MGT 808-WS) [Fundamentals of Consulting]")).toBe(false);
  });
});

describe("resolving a course name to its real code across the feed", () => {
  it("learns the code from the meetings and lends it to the assignments", () => {
    const codes = resolveCourseCodes([...MEETINGS, ...WORK]);
    expect(codes.get("Fundamentals of Consulting")).toBe("MGT 808");
    expect(codes.get("Market Microstructure and Trading Strategies")).toBe("FE 570");
    expect(codes.get("Computational Methods in Finance")).toBe("FE 621");
  });

  it("gives an assignment its course code even though the title has none", () => {
    const codes = resolveCourseCodes([...MEETINGS, ...WORK]);
    // Before this, 37 tasks keyed under the course *name* and 13 under the
    // code, so neither bucket ever reached the estimator's five samples.
    expect(courseCode("Case Study: Fate of the Vasa [Fundamentals of Consulting]", codes)).toBe("MGT 808");
    expect(courseCode("Student Video Introduction [Fundamentals of Consulting]", codes)).toBe("MGT 808");
  });

  it("prefers a code written in the title over the resolved one", () => {
    const codes = new Map([["Fundamentals of Consulting", "MGT 808"]]);
    expect(courseCode("CS 0441 Homework 2 [Fundamentals of Consulting]", codes)).toBe("CS 0441");
  });

  it("falls back to the course name when nothing resolves it", () => {
    expect(courseCode("Overview Quiz [Business School Summer Research Fellowship Program]")).toBe(
      "Business School Summer Research Fellowship Program",
    );
  });

  it("takes the most-seen code when a course was renumbered between terms", () => {
    const codes = resolveCourseCodes([
      "2024F MGT 700-A [Fundamentals of Consulting]",
      "2025S MGT 808-WS1 [Fundamentals of Consulting]",
      "2026F MGT 808-WS [Fundamentals of Consulting]",
    ]);
    expect(codes.get("Fundamentals of Consulting")).toBe("MGT 808");
  });

  it("reads the pieces it is built from", () => {
    expect(bracketName("Anything [Fundamentals of Consulting]")).toBe("Fundamentals of Consulting");
    expect(codeFromText("2026F MGT 808-WS Tuesday Class")).toBe("MGT 808");
    expect(codeFromText("no code here")).toBeUndefined();
  });
});

describe("estimates that distinguish real coursework", () => {
  it("no longer collapses everything to the default hour", () => {
    // The failure this fixes: 50 of 59 imported tasks came back at exactly 60,
    // which makes the capacity ledger meaningless.
    const mins = WORK.map((w) => heuristicMinutes(w.replace(/\s*\[[^\]]+\]\s*$/, "")));
    expect(new Set(mins).size).toBeGreaterThan(1);
    expect(mins.filter((m) => m === 60)).toHaveLength(0);
  });

  it("sizes each kind the way the work actually behaves", () => {
    expect(heuristicMinutes("Case Study: Deloitte & Touche (1 student)")).toBe(120);
    expect(heuristicMinutes("Week 4 - Consulting Legend - Barbara Minto")).toBe(30);
    expect(heuristicMinutes("ManageMentor Module: Presentation Skills")).toBe(75);
    expect(heuristicMinutes("Student Video Introduction")).toBe(15);
    expect(heuristicMinutes("Mid Term Evaluation Survey")).toBe(15);
  });

  it("does not read a weekly quiz as an exam", () => {
    // "Mid Term Evaluation Survey" contains "mid term"; a survey is 15 minutes.
    expect(heuristicMinutes("Mid Term Evaluation Survey")).toBeLessThan(60);
    expect(heuristicMinutes("Attendance Quiz - Week 1")).toBeLessThanOrEqual(45);
  });

  it("keeps the original rules working", () => {
    expect(heuristicMinutes("Problem Set 4")).toBe(90);
    expect(heuristicMinutes("Reading: Chapter 3")).toBe(40);
    expect(heuristicMinutes("Essay draft")).toBe(180);
    expect(heuristicMinutes("Final exam prep")).toBe(240);
  });
});
