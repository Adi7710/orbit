import { describe, expect, it } from "vitest";
import { normalize } from "@/agents/parse";

/** The exact shape the hosted Nemotron Parse endpoint returns (verified 2026-09-19, issue #6). */
const body = {
  choices: [{
    message: {
      content: "",
      tool_calls: [{
        function: {
          arguments: JSON.stringify([[
            { type: "Title", text: "CS 0441  Discrete Structures", bbox: { xmin: 0.08, ymin: 0.04, xmax: 0.72, ymax: 0.07 } },
            { type: "Section-Header", text: "SCHEDULE AND DEADLINES", bbox: { xmin: 0.08, ymin: 0.21, xmax: 0.45, ymax: 0.23 } },
            { type: "Table", text: "\begin{tabular}{llll} 3 & Sept 15 & Homework 1: Logic & Sept 22, 11:59 PM \end{tabular}", bbox: { xmin: 0.08, ymin: 0.25, xmax: 0.9, ymax: 0.52 } },
            { type: "Text", text: "", bbox: { xmin: 0, ymin: 0, xmax: 0, ymax: 0 } },
          ]]),
        },
      }],
    },
  }],
};

describe("Nemotron Parse response normalization", () => {
  const out = normalize(body, 1);

  it("flattens the array of arrays instead of reading the outer array as one element", () => {
    expect(out.elements).toHaveLength(3); // the empty-text element is dropped
    expect(out.elements[0].text).toContain("Discrete Structures");
    expect(out.elements.map((e) => e.type)).toEqual(["Title", "Section-Header", "Table"]);
  });

  it("keeps boxes normalized 0..1 as [xmin, ymin, xmax, ymax]", () => {
    expect(out.elements[0].bbox).toEqual([0.08, 0.04, 0.72, 0.07]);
    expect(out.elements.every((e) => e.bbox.every((v) => v >= 0 && v <= 1))).toBe(true);
  });

  it("falls back to joined text when the model returns no markdown content", () => {
    expect(out.markdown).toContain("SCHEDULE AND DEADLINES");
  });

  it("survives plain markdown with no tool call", () => {
    const md = normalize({ choices: [{ message: { content: "# Syllabus\nHomework 1 due Sept 22" } }] }, 1);
    expect(md.elements).toHaveLength(0);
    expect(md.markdown).toContain("Homework 1");
  });

  it("survives malformed arguments without throwing", () => {
    const bad = normalize({ choices: [{ message: { content: "fallback text", tool_calls: [{ function: { arguments: "{not json" } }] } }] }, 1);
    expect(bad.markdown).toBe("fallback text");
    expect(bad.elements).toHaveLength(0);
  });
});
