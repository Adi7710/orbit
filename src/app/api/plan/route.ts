import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today";
import { log, store } from "@/lib/store";
import { claudeSpend, daySummary, planDay, planDayWithNemotron, type Proposal } from "@/agents/dayAgent";
import { fmt } from "@/core/time";
import { STUDY_SPOT } from "@/services/schedule";
import { countThings, naturalDuration } from "@/core/say";

export const dynamic = "force-dynamic";

/**
 * The last plan Nemotron actually produced, keyed by what it was asked --
 * the windows, the live tasks and the mode -- so a stale plan is never
 * served against a different day. Stale-while-revalidate: a plan under ten
 * minutes old is served at once and refreshed behind it; under an hour it is
 * the answer when the live race loses. The provider string always says which.
 *
 * Why: on submission morning the hosted endpoint answered about half of
 * calls inside budget, on every model, with fresh connections and a race.
 * A judge tapping Plan my day gets Nemotron's own plan for this day either
 * way; what changes is whether the model was asked ten seconds ago or ten
 * minutes ago, and the screen says so.
 */
type Planned = { proposals: Proposal[]; narration: string; dropped: number; at: number };
const planCache = new Map<string, Planned>();
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
let refreshing = false;

// The windows by id, not by size: a window under way shrinks by a minute
// every minute, and keying on its usable minutes meant every tap was a cache
// miss and the plan Nemotron gave seven minutes ago was never served.
const contextKey = (ctx: { gaps: { id: string }[]; tasks: { id: string; completedAt?: unknown }[]; mode: string }) =>
  `${ctx.mode}|${ctx.gaps.map((g) => g.id).join(",")}|${ctx.tasks.filter((t) => !t.completedAt).map((t) => t.id).sort().join(",")}`;

const agoText = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
};

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
  //
  // Order, by Adi's call: Nemotron first, Claude as the fallback, code last.
  // Nemotron is the model this build is about; Claude is the stronger planner
  // with the wider tool set (extension drafts, friend invites) and steps in
  // when Nemotron cannot answer inside its budget. Either way, any window a
  // model leaves empty gets the pick the Today screen already shows, so the
  // demo never shows fewer proposals than the deterministic plan would have.
  const missing: string[] = [];
  if (!process.env.NVIDIA_API_KEY) missing.push("no NVIDIA_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("no ANTHROPIC_API_KEY");
  let provider = missing.join(", ");
  const ctx = { ledger: today.ledger, gaps: today.gaps, tasks: today.tasks, sharedWindows: today.shared, instructors: s.instructors, mode: s.mode };

  /** Fill windows the model skipped with the Today screen's own pick. Returns how many. */
  const fillGaps = () => {
    const taken = new Set(proposals.map((p) => ("gapId" in p ? p.gapId : undefined)));
    let filled = 0;
    for (const g of today.gaps) {
      if (taken.has(g.id) || !g.pick) continue;
      proposals.push({ kind: "move_task", taskId: g.pick.id, gapId: g.id, reason: `${g.pick.title} fits the ${g.usable}-minute window` });
      filled++;
    }
    return filled ? ` + code (${filled} window${filled === 1 ? "" : "s"} filled)` : "";
  };
  const note = (label: string) => { provider = provider ? `${provider}, ${label}` : label; };

  // Tier 1: Nemotron. move_task and book_room only; every id checked.
  if (process.env.NVIDIA_API_KEY) {
    const key = contextKey(ctx);
    const cached = planCache.get(key);
    const age = cached ? Date.now() - cached.at : Infinity;

    /** Ask the model and, if it answers, remember the answer for this exact day. */
    const askLive = async () => {
      const out = await planDayWithNemotron(ctx, daySummary(ctx));
      if (out.proposals.length > 0) planCache.set(key, { ...out, at: Date.now() });
      return out;
    };

    if (cached && age < FRESH_MS) {
      // Fresh enough to serve at once; refresh behind it so the next tap is
      // newer still. One refresh in flight at a time.
      proposals = [...cached.proposals];
      narration = cached.narration;
      provider = `nemotron-hosted (asked ${agoText(cached.at)})${cached.dropped ? ` (${cached.dropped} dropped: bad ids)` : ""}${fillGaps()}`;
      if (!refreshing) {
        refreshing = true;
        void askLive().catch(() => {}).finally(() => { refreshing = false; });
      }
    } else {
      try {
        const out = await askLive();
        if (out.proposals.length > 0) {
          proposals = out.proposals;
          narration = out.narration;
          provider = `nemotron-hosted${out.dropped ? ` (${out.dropped} dropped: bad ids)` : ""}${fillGaps()}`;
        } else {
          note("nemotron proposed nothing");
        }
      } catch (e) {
        note(`nemotron ${(e as Error).message}`);
      }
      // The live race lost. The last plan the model gave for this same day,
      // if it is under an hour old, beats a plan the model never saw.
      if (proposals.length === 0 && cached && age < STALE_MS) {
        proposals = [...cached.proposals];
        narration = cached.narration;
        provider = `nemotron-hosted (asked ${agoText(cached.at)}; live call timed out)${fillGaps()}`;
      }
    }
  }

  // Tier 2: Claude, when Nemotron did not answer.
  if (proposals.length === 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await planDay(ctx);
      if (out.proposals.length > 0) {
        proposals = out.proposals;
        narration = out.narration;
        provider = `claude-sonnet-5${fillGaps()}`;
      } else {
        note("claude proposed nothing");
      }
    } catch (e) {
      note(`claude failed (${(e as Error).message}`);
    }
  }

  if (proposals.length === 0) {
    // Tier 3: deterministic, so the demo never depends on a model or a key.
    note("deterministic");
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
