import { heuristicMinutes } from "@/core/estimator";
import { nemotronJson } from "./models";

/**
 * Nemotron's non-chat job #1: estimate how long a task takes and which
 * domain it belongs to, from the title and course. This is what gets
 * evaluated against the synthetic session log (see /eval).
 */
export interface EstimateOut { minutes: number; domain: "learn" | "build" | "body" | "life"; confidence: number }

const schema = {
  type: "object",
  properties: {
    minutes: { type: "integer" },
    domain: { type: "string", enum: ["learn", "build", "body", "life"] },
    confidence: { type: "number" },
  },
  required: ["minutes", "domain", "confidence"],
  additionalProperties: false,
};

export async function estimateTask(title: string, courseCode?: string) {
  return nemotronJson<EstimateOut>(
    "You estimate how many focused minutes a college task takes. Reply with JSON only. Problem sets 60-150, readings 20-60, essays 120-300, exams prep 180-360, gym 45-90. Domain: learn=reading/studying, build=graded deliverables, body=exercise/health, life=errands/social.",
    `Task: ${title}${courseCode ? ` (${courseCode})` : ""}`,
    schema,
    () => ({ minutes: heuristicMinutes(title), domain: "build" as const, confidence: 0.3 }),
  );
}
