import { nemotronJson } from "./models";
import type { ParsedPage } from "./parse";
import type { Task } from "@/core/types";
import { heuristicMinutes } from "@/core/estimator";

/**
 * Syllabus -> tasks with provenance. Nemotron Parse gives us elements with
 * boxes; Nemotron (text) turns them into dated obligations; code verifies that
 * every extracted item quotes a real element verbatim, and attaches that
 * element's page and box as evidence. Anything the model invents is dropped.
 */
export interface Obligation { title: string; due: string; quote: string; kind: "assignment" | "exam" | "reading" | "project" | "quiz" | "other" }

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          due: { type: "string", description: "ISO date YYYY-MM-DD if known, else empty string" },
          quote: { type: "string", description: "verbatim text from the document that states this obligation" },
          kind: { type: "string", enum: ["assignment", "exam", "reading", "project", "quiz", "other"] },
        },
        required: ["title", "due", "quote", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export async function obligationsFromPages(pages: ParsedPage[], courseCode?: string) {
  const text = pages.map((p) => `--- page ${p.page} ---\n${p.markdown}`).join("\n");
  const result = await nemotronJson<{ items: Obligation[] }>(
    "You extract dated obligations (assignments, exams, readings, projects, quizzes) from a college syllabus. Only include items with a date or a clear week. The quote field must be copied verbatim from the document.",
    text.slice(0, 12000),
    schema,
    () => ({ items: [] }),
  );

  const tasks: Task[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const allElements = pages.flatMap((p) => p.elements);
  for (const it of result.data.items) {
    const q = it.quote.trim().toLowerCase();
    const el = allElements.find((e) => q && e.text.toLowerCase().includes(q.slice(0, 40)));
    const inMarkdown = q && text.toLowerCase().includes(q.slice(0, 40));
    if (!el && !inMarkdown) { rejected.push({ title: it.title, reason: "quote not found verbatim in document" }); continue; }
    const due = it.due && /^\d{4}-\d{2}-\d{2}$/.test(it.due) ? new Date(`${it.due}T23:59:00`) : undefined;
    tasks.push({
      id: `syl-${crypto.randomUUID().slice(0, 8)}`,
      title: it.title,
      domain: it.kind === "reading" ? "learn" : "build",
      estimateMinutes: heuristicMinutes(it.title),
      dueAt: due,
      courseCode,
      source: "syllabus",
      evidence: el ? { kind: "syllabus", page: el.page, bbox: el.bbox, text: el.text } : { kind: "syllabus", page: 1, bbox: [0, 0, 0, 0], text: it.quote },
    });
  }
  return { tasks, rejected, provider: result.provider, model: result.model, latencyMs: result.latencyMs, error: result.error };
}
