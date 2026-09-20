import { claude, nemotronJson } from "./models";
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
  | { kind: "notify_friends"; gapId: string; userIds: string[]; message: string; reason: string }
  // Written by the Email Agent, never by the Day Agent -- it is not in the
  // tool list below on purpose. The only agent allowed to write to another
  // human has its own prompt, its own validation and its own blast radius.
  | { kind: "send_email"; to: string; subject: string; body: string; courseCode: string; reason: string };

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

/** Claude spend tracker: $25 of credits, Sonnet 5 at $2/$10 per MTok, cache reads at $0.20. */
export const claudeSpend = { calls: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, usd: 0 };
function recordCost(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const cr = u.cache_read_input_tokens ?? 0, cw = u.cache_creation_input_tokens ?? 0;
  claudeSpend.calls += 1;
  claudeSpend.inputTokens += u.input_tokens;
  claudeSpend.outputTokens += u.output_tokens;
  claudeSpend.cacheRead += cr;
  claudeSpend.cacheWrite += cw;
  claudeSpend.usd += (u.input_tokens * 2 + u.output_tokens * 10 + cr * 0.2 + cw * 2.5) / 1e6;
}

/**
 * The same job on Nemotron, for when there is no Anthropic key.
 *
 * Deliberately narrower than the Claude version: it may only propose moving a
 * task into a gap or booking a room. `draft_extension` and `notify_friends`
 * both end up in front of another human and require quoting the ledger
 * verbatim, and a model that mis-copies a number into an email to an
 * instructor is a different class of mistake from one that suggests the wrong
 * study window. Those stay with Claude and the Email Agent.
 *
 * Every id the model returns is checked against the real gaps and tasks, so a
 * proposal pointing at something that does not exist is dropped rather than
 * shown.
 */
const nemotronSchema = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["move_task", "book_room"] },
          taskId: { type: "string", description: "Required for move_task. Must be one of the task ids given." },
          gapId: { type: "string", description: "Which gap. Must be one of the gap ids given." },
          building: { type: "string", description: "Required for book_room." },
          reason: { type: "string", description: "Under 15 words, in the student's own terms." },
        },
        required: ["kind", "gapId", "reason"],
        additionalProperties: false,
      },
    },
    narration: { type: "string", description: "One sentence in the student's voice, playful but never cringe." },
  },
  required: ["proposals", "narration"],
  additionalProperties: false,
};

export async function planDayWithNemotron(ctx: DayContext, summary: string): Promise<{ proposals: Proposal[]; narration: string; dropped: number }> {
  const system = [
    "You are Orbit's day agent for a college student. You never act: you propose, and the student confirms.",
    "Propose at most one task per gap, and only tasks that fit the gap's usable minutes.",
    "In crisis mode propose coursework only.",
    "Use only the gap ids and task ids you are given. Never invent one.",
    "Then write one sentence of narration in the student's voice, playful but not cringe.",
  ].join(" ");

  const r = await nemotronJson<{ proposals?: Record<string, string>[]; narration?: string }>(
    system, summary, nemotronSchema, () => ({ proposals: [], narration: "" }), 25000,
  );
  if (r.provider === "heuristic") throw new Error(r.error ?? "nemotron unavailable");

  const gapIds = new Set(ctx.gaps.map((g) => g.id));
  const taskIds = new Set(ctx.tasks.filter((t) => !t.completedAt).map((t) => t.id));
  const proposals: Proposal[] = [];
  let dropped = 0;
  const usedGaps = new Set<string>();

  for (const raw of r.data.proposals ?? []) {
    const gapId = String(raw.gapId ?? "");
    const reason = String(raw.reason ?? "").trim().slice(0, 120);
    if (!gapIds.has(gapId) || usedGaps.has(gapId)) { dropped++; continue; }
    if (raw.kind === "move_task") {
      const taskId = String(raw.taskId ?? "");
      if (!taskIds.has(taskId)) { dropped++; continue; }
      proposals.push({ kind: "move_task", taskId, gapId, reason });
    } else if (raw.kind === "book_room") {
      const building = String(raw.building ?? "").trim();
      if (!building) { dropped++; continue; }
      proposals.push({ kind: "book_room", gapId, building, reason });
    } else {
      dropped++;
      continue;
    }
    usedGaps.add(gapId);
  }
  return { proposals, narration: (r.data.narration ?? "").trim(), dropped };
}

/** The context summary both models are given, so they are asked the same question. */
export function daySummary(ctx: DayContext): string {
  return [
    `Mode: ${ctx.mode}. Usable minutes ${ctx.ledger.usable}, queued ${ctx.ledger.queued}, slack ${ctx.ledger.slack}.`,
    `Gaps: ${ctx.gaps.map((g) => `${g.id} ${fmt(g.start)}-${fmt(g.end)} (${g.usable}m, from ${g.fromPlace})`).join("; ") || "none"}.`,
    `Tasks: ${ctx.tasks.filter((t) => !t.completedAt).map((t) => `${t.id} "${t.title}" ${t.estimateMinutes}m${t.dueAt ? ` due ${t.dueAt.toDateString()}` : ""}${t.courseCode ? ` [${t.courseCode}]` : ""}`).join("; ")}.`,
    `Shared free windows: ${ctx.sharedWindows.map((w) => `${fmt(w.start)}-${fmt(w.end)} with ${w.userIds.join(",")}`).join("; ") || "none"}.`,
    `Instructor emails: ${JSON.stringify(ctx.instructors)}.`,
  ].join("\n");
}

export async function planDay(ctx: DayContext): Promise<{ proposals: Proposal[]; narration: string }> {
  const summary = daySummary(ctx);

  const res = await claude().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 900,
    system: [
      {
        type: "text",
        text: "You are Orbit's day agent for a college student. You never act; you propose, using tools, and a human confirms. Propose at most one task per gap. Only draft an extension if slack is below -60 minutes and the task is due within 72 hours; cite the exact usable and queued minutes. In crisis mode propose only coursework. Finish with one sentence of narration in the student's voice, playful but not cringe.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t)),
    messages: [{ role: "user", content: summary }],
  });
  recordCost(res.usage);

  const proposals: Proposal[] = [];
  let narration = "";
  for (const block of res.content) {
    if (block.type === "tool_use") proposals.push({ kind: block.name as Proposal["kind"], ...(block.input as object) } as Proposal);
    if (block.type === "text") narration += block.text;
  }
  return { proposals, narration: narration.trim() };
}
