import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today";
import { log, store } from "@/lib/store";
import { claudeSpend, daySummary, planDay, planDayWithNemotron, type Proposal } from "@/agents/dayAgent";
import { fmt } from "@/core/time";
import { STUDY_SPOT } from "@/services/schedule";
import { countThings, naturalDuration } from "@/core/say";

export const dynamic = "force-dynamic";

/** Ask the Day Agent for proposals. Falls back to deterministic proposals when no Claude key is present. */
export async function POST() {
  const s = store();
  const today = await buildToday();
  let proposals: Proposal[] = [];
  let narration = "";
  // Named after whoever actually answered, set only on success. It used to
  // start as "claude-sonnet-5" and be rewritten on failure, so a day with no
  // window -- where every tier returns nothing -- reported Claude with no
  // Anthropic key in the environment.
  let provider = process.env.ANTHROPIC_API_KEY ? "" : "no ANTHROPIC_API_KEY";

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
      provider = "claude-sonnet-5";
    } catch (e) {
      provider = `claude failed (${(e as Error).message})`;
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
        // The model proposes; code guarantees coverage. First live run with a
        // key: one proposal, the gym into the midday window, and the problem
        // set due in two days left out entirely -- a worse plan than the
        // deterministic one. So any window the model leaves empty gets the
        // same pick the Today screen already shows, and the provider says so.
        // Proposal is a union and draft_extension carries no gapId.
        const taken = new Set(proposals.map((p) => ("gapId" in p ? p.gapId : undefined)));
        let filled = 0;
        for (const g of today.gaps) {
          if (taken.has(g.id) || !g.pick) continue;
          proposals.push({ kind: "move_task", taskId: g.pick.id, gapId: g.id, reason: `${g.pick.title} fits the ${g.usable}-minute window` });
          filled++;
        }
        provider = `nemotron-hosted${out.dropped ? ` (${out.dropped} dropped: bad ids)` : ""}${filled ? ` + code (${filled} window${filled === 1 ? "" : "s"} filled)` : ""}`;
      }
    } catch (e) {
      provider = `${provider}, nemotron ${(e as Error).message}`;
    }
  }

  if (proposals.length === 0) {
    // Deterministic proposals so the demo never depends on the model.
    provider = `${provider ? `${provider}, ` : ""}deterministic`;
    for (const g of today.gaps) {
      if (g.pick) proposals.push({ kind: "move_task", taskId: g.pick.id, gapId: g.id, reason: `${g.pick.title} fits the ${g.usable}-minute window` });
      if (g.usable >= 60 && !g.isEvening) proposals.push({ kind: "book_room", gapId: g.id, building: STUDY_SPOT, reason: "long focused window near your next class" });
    }
    const w = today.shared[0];
    if (w) proposals.push({ kind: "notify_friends", gapId: today.gaps[0]?.id ?? "gap-0", userIds: w.userIds, message: `Free ${w.startText}-${w.endText}, ${STUDY_SPOT}?`, reason: `${w.names.join(" and ")} ${w.names.length === 1 ? "is" : "are"} free at the same time` });
    if (today.ledger.slack < -60) {
      const due = today.tasks.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
      if (due) proposals.push({ kind: "draft_extension", taskId: due.id, newDate: "Friday", to: s.instructors[due.courseCode ?? ""] ?? "instructor@example.edu", subject: `${due.title}: extension request`, body: `Hi Professor, I have ${today.ledger.usable} usable minutes this week against ${today.ledger.queued} minutes of assigned work. Could I submit ${due.title} on Friday? Thank you.`, reason: `slack is ${today.ledger.slack} minutes` });
    }
    // Composed from what is actually there. The old line was "Two windows
    // today, 200 and 446 minutes ... Leave by whenever for the bus" -- a fixed
    // count, bare minutes, and a bus that did not exist, read out at beat 2.
    if (!narration) {
      const gaps = today.gaps;
      const windows = gaps.length === 0
        ? "No window left today."
        : `${countThings(gaps.length, "window", "windows")} today, ${gaps.map((g) => naturalDuration(g.usable)).join(" and ")}. I picked one thing for each.`;
      // countThings speaks lowercase ("two windows"); this opens a sentence.
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      const bus = today.bus ? ` Leave by ${today.bus.leaveByText} for the ${today.bus.route}.` : "";
      narration = `${cap(windows)}${bus}`;
    }
  }

  const stored = proposals.map((p) => ({ id: crypto.randomUUID(), proposal: p, status: "pending" as const, createdAt: new Date().toISOString() }));
  s.proposals.push(...stored);
  log("agent", "proposals_created", { count: stored.length, provider, at: fmt(new Date().getHours() * 60 + new Date().getMinutes()), claudeSpendUsd: +claudeSpend.usd.toFixed(4), claudeCalls: claudeSpend.calls });
  return NextResponse.json({ proposals: stored, narration, provider, claudeSpend: { ...claudeSpend, usd: +claudeSpend.usd.toFixed(4), budgetUsd: 25 } });
}
