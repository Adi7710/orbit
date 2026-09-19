import { claude } from "./models";
import type { Ledger } from "@/core/ledger";
import type { Gap } from "@/core/gaps";
import type { Task } from "@/core/types";
import { fmt } from "@/core/time";

/**
 * The Day Agent acts, but only through proposals a human confirms.
 * Tools it may call:
 *  - book_room(gapId, building)         -> proposal
 *  - move_task(taskId, gapId)           -> proposal
 *  - draft_extension(taskId, newDate)   -> proposal (email draft with ledger evidence)
 *  - notify_friends(gapId, userIds)     -> proposal
 * It has no tool that sends, books or moves anything directly.
 */
export type Proposal =
  | { kind: "book_room"; gapId: string; building: string; reason: string }
  | { kind: "move_task"; taskId: string; gapId: string; reason: string }
  | { kind: "draft_extension"; taskId: string; newDate: string; to: string; subject: string; body: string; reason: string }
  | { kind: "notify_friends"; gapId: string; userIds: string[]; message: string; reason: string };

const tools: import("@anthropic-ai/sdk").Anthropic.Tool[] = [
  { name: "book_room", description: "Propose reserving a study room for a gap. Use when a gap is >= 60 minutes and the best-fit task needs focus.", input_schema: { type: "object", properties: { gapId: { type: "string" }, building: { type: "string" }, reason: { type: "string" } }, required: ["gapId", "building", "reason"] } },
  { name: "move_task", description: "Propose placing a task into a gap it fits in.", input_schema: { type: "object", properties: { taskId: { type: "string" }, gapId: { type: "string" }, reason: { type: "string" } }, required: ["taskId", "gapId", "reason"] } },
  { name: "draft_extension", description: "Propose an extension request email to the instructor when queued work exceeds usable minutes by more than a day. Body must cite the ledger numbers verbatim and be under 120 words, polite, no excuses.", input_schema: { type: "object", properties: { taskId: { type: "string" }, newDate: { type: "string" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, reason: { type: "string" } }, required: ["taskId", "newDate", "to", "subject", "body", "reason"] } },
  { name: "notify_friends", description: "Propose inviting friends who share a free window to study together.", input_schema: { type: "object", properties: { gapId: { type: "string" }, userIds: { type: "array", items: { type: "string" } }, message: { type: "string" }, reason: { type: "string" } }, required: ["gapId", "userIds", "message", "reason"] } },
];

export interface DayContext {
  ledger: Ledger;
  gaps: Gap[];
  tasks: Task[];
  sharedWindows: { start: number; end: number; userIds: string[] }[];
  instructors: Record<string, string>; // courseCode -> email
  mode: "normal" | "crisis" | "chill";
}

export async function planDay(ctx: DayContext): Promise<{ proposals: Proposal[]; narration: string }> {
  const summary = [
    `Mode: ${ctx.mode}. Usable minutes ${ctx.ledger.usable}, queued ${ctx.ledger.queued}, slack ${ctx.ledger.slack}.`,
    `Gaps: ${ctx.gaps.map((g) => `${g.id} ${fmt(g.start)}-${fmt(g.end)} (${g.usable}m, from ${g.fromPlace})`).join("; ") || "none"}.`,
    `Tasks: ${ctx.tasks.filter((t) => !t.completedAt).map((t) => `${t.id} "${t.title}" ${t.estimateMinutes}m${t.dueAt ? ` due ${t.dueAt.toDateString()}` : ""}${t.courseCode ? ` [${t.courseCode}]` : ""}`).join("; ")}.`,
    `Shared free windows: ${ctx.sharedWindows.map((w) => `${fmt(w.start)}-${fmt(w.end)} with ${w.userIds.join(",")}`).join("; ") || "none"}.`,
    `Instructor emails: ${JSON.stringify(ctx.instructors)}.`,
  ].join("\n");

  const res = await claude().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    system:
      "You are Orbit's day agent for a college student. You never act; you propose, using tools, and a human confirms. Propose at most one task per gap. Only draft an extension if slack is below -60 minutes and the task is due within 72 hours; cite the exact usable and queued minutes. In crisis mode propose only coursework. Finish with one sentence of narration in the student's voice, playful but not cringe.",
    tools,
    messages: [{ role: "user", content: summary }],
  });

  const proposals: Proposal[] = [];
  let narration = "";
  for (const block of res.content) {
    if (block.type === "tool_use") proposals.push({ kind: block.name as Proposal["kind"], ...(block.input as object) } as Proposal);
    if (block.type === "text") narration += block.text;
  }
  return { proposals, narration: narration.trim() };
}
