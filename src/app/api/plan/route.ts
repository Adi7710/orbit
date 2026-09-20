import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today";
import { log, store } from "@/lib/store";
import { claudeSpend, daySummary, planDay, planDayWithNemotron, type Proposal } from "@/agents/dayAgent";
import { fmt } from "@/core/time";

export const dynamic = "force-dynamic";

/** Ask the Day Agent for proposals. Falls back to deterministic proposals when no Claude key is present. */
export async function POST() {
  const s = store();
  const today = await buildToday();
  let proposals: Proposal[] = [];
  let narration = "";
  let provider = "claude-sonnet-5";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await planDay({
        ledger: today.ledger,
        gaps: today.gaps,
        tasks: today.tasks,
        sharedWindows: today.shared,
        instructors: s.instructors,
        mode: s.mode,
      });
      proposals = out.proposals;
      narration = out.narration;
    } catch (e) {
      provider = `fallback (${(e as Error).message})`;
    }
  }

  // Nemotron is the second tier, not a consolation prize: with no Anthropic key
  // it is what makes "Plan my day" a real agent call instead of a canned list.
  // It may only propose moving a task or booking a room, and every id it
  // returns is checked against the real gaps and tasks before anything is shown.
  if (proposals.length === 0) {
    const ctx = { ledger: today.ledger, gaps: today.gaps, tasks: today.tasks, sharedWindows: today.shared, instructors: s.instructors, mode: s.mode };
    try {
      const out = await planDayWithNemotron(ctx, daySummary(ctx));
      if (out.proposals.length > 0) {
        proposals = out.proposals;
        narration = out.narration;
        provider = `nemotron-hosted${out.dropped ? ` (${out.dropped} dropped: bad ids)` : ""}`;
      }
    } catch (e) {
      provider = `${provider.startsWith("claude") ? "no ANTHROPIC_API_KEY" : provider}, nemotron ${(e as Error).message}`;
    }
  }

  if (proposals.length === 0) {
    // Deterministic proposals so the demo never depends on the model.
    for (const g of today.gaps) {
      if (g.pick) proposals.push({ kind: "move_task", taskId: g.pick.id, gapId: g.id, reason: `${g.pick.title} fits the ${g.usable}-minute window` });
      if (g.usable >= 60 && !g.isEvening) proposals.push({ kind: "book_room", gapId: g.id, building: "Hillman", reason: "long focused window near your next class" });
    }
    const w = today.shared[0];
    if (w) proposals.push({ kind: "notify_friends", gapId: today.gaps[0]?.id ?? "gap-0", userIds: w.userIds, message: `Free ${w.startText}-${w.endText}, Hillman 2nd floor?`, reason: `${w.names.join(" and ")} are free at the same time` });
    if (today.ledger.slack < -60) {
      const due = today.tasks.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
      if (due) proposals.push({ kind: "draft_extension", taskId: due.id, newDate: "Friday", to: s.instructors[due.courseCode ?? ""] ?? "instructor@example.edu", subject: `${due.title}: extension request`, body: `Hi Professor, I have ${today.ledger.usable} usable minutes this week against ${today.ledger.queued} minutes of assigned work. Could I submit ${due.title} on Friday? Thank you.`, reason: `slack is ${today.ledger.slack} minutes` });
    }
    narration = narration || `Two windows today, ${today.gaps.map((g) => g.usable).join(" and ")} minutes. I picked one thing for each. Leave by ${today.bus?.leaveByText ?? "whenever"} for the bus.`;
  }

  const stored = proposals.map((p) => ({ id: crypto.randomUUID(), proposal: p, status: "pending" as const, createdAt: new Date().toISOString() }));
  s.proposals.push(...stored);
  log("agent", "proposals_created", { count: stored.length, provider, at: fmt(new Date().getHours() * 60 + new Date().getMinutes()), claudeSpendUsd: +claudeSpend.usd.toFixed(4), claudeCalls: claudeSpend.calls });
  return NextResponse.json({ proposals: stored, narration, provider, claudeSpend: { ...claudeSpend, usd: +claudeSpend.usd.toFixed(4), budgetUsd: 25 } });
}
