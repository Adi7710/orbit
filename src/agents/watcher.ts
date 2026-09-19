import { store, log } from "@/lib/store";
import { buildToday } from "@/lib/today";
import type { Proposal } from "./dayAgent";
import { fmt } from "@/core/time";
import { isMuted, judge, record, MUTE_BELOW, type Scores, type Verdict } from "./critic";

/**
 * The Watcher.
 *
 * Everything else in Orbit answers a question when you ask it. The Watcher
 * asks its own. It takes a snapshot of the day every tick, diffs it against
 * the last one, and when the world has actually changed it decides what to do
 * about it: quietly for things that only touch your own screen, as a proposal
 * for anything that reaches another person.
 *
 * The rules it lives by, which are also the answer to "what could go wrong":
 *
 *  - **Tier A, acts on its own.** Re-picking which task goes in a gap,
 *    re-ranking quests, updating the bus. Reversible, invisible to anyone
 *    else, and always explained in the trace.
 *  - **Tier B, proposes only.** Booking a room, messaging a friend, drafting
 *    an extension. Anything that leaves the building needs a human tap.
 *  - **Never.** Completing work for you, awarding XP, sending anything.
 *
 * Every tick appends to a trace with the evidence that triggered it, so you
 * can always answer "why did it do that". It can be paused and it can be
 * killed, and both are one click.
 */

export type Tier = "A" | "B";
export type WatcherState = "running" | "paused" | "killed";

export interface Snapshot {
  at: number;
  gapIds: string[];
  gapMinutes: Record<string, number>;
  /** Windows already under way, whose usable minutes fall as the clock moves. */
  inProgress: string[];
  picks: Record<string, string | undefined>;
  slack: number;
  overCommitted: boolean;
  busLeaveBy?: number;
  busRoute?: string;
  busStatus?: string;
  classCount: number;
  openTaskIds: string[];
  urgentUnplanned: string[];
  mode: string;
}

export interface WatcherEvent {
  kind: "gap_opened" | "gap_grew" | "gap_shrank" | "gap_closed" | "bus_slipped" | "now_overcommitted" | "now_fits" | "deadline_unplanned" | "class_removed";
  headline: string;
  evidence: string;
  gapId?: string;
  taskId?: string;
  minutes?: number;
}

export interface TraceEntry {
  seq: number;
  at: string;
  event: WatcherEvent;
  tier: Tier;
  action: string;
  reasoning: string;
  proposalId?: string;
  applied: boolean;
  /** What the Critic made of it. See src/agents/critic.ts. */
  score?: number;
  scores?: Scores;
  verdict?: Verdict;
  critique?: string;
  judgedBy?: string;
}

export interface WatcherStatus {
  state: WatcherState;
  ticks: number;
  lastTickAt?: string;
  lastTickText?: string;
  trace: TraceEntry[];
  watching: string[];
}

interface WatcherMemory { state: WatcherState; ticks: number; last?: Snapshot; trace: TraceEntry[]; lastTickAt?: number }

const g = globalThis as unknown as { __orbitWatcher?: WatcherMemory };
function mem(): WatcherMemory {
  if (!g.__orbitWatcher) g.__orbitWatcher = { state: "running", ticks: 0, trace: [] };
  return g.__orbitWatcher;
}

export function watcherReset() { g.__orbitWatcher = { state: "running", ticks: 0, trace: [] }; }
export function setWatcherState(state: WatcherState) { mem().state = state; }

/** What the Watcher is looking at, for the UI to show plainly. */
export const WATCHING = [
  "classes appearing or disappearing",
  "gaps opening, shrinking or closing",
  "the live bus slipping",
  "the day no longer fitting",
  "deadlines inside 24 hours with nowhere to do them",
];

export async function snapshot(): Promise<Snapshot> {
  const t = await buildToday();
  const now = Date.now();
  const urgent = t.tasks
    .filter((x) => x.dueAt && (new Date(x.dueAt).getTime() - now) / 36e5 <= 24)
    .filter((x) => !t.gaps.some((gp) => gp.pick?.id === x.id))
    .map((x) => x.id);
  return {
    at: now,
    gapIds: t.gaps.map((x) => x.id),
    gapMinutes: Object.fromEntries(t.gaps.map((x) => [x.id, x.usable])),
    inProgress: t.gaps.filter((x) => x.inProgress).map((x) => x.id),
    picks: Object.fromEntries(t.gaps.map((x) => [x.id, x.pick?.id])),
    slack: t.ledger.slack,
    overCommitted: t.ledger.overCommitted,
    busLeaveBy: t.bus ? Math.floor(t.bus.leaveBySec / 60) : undefined,
    busRoute: t.bus?.route,
    busStatus: t.bus?.status,
    classCount: store().blocks.length,
    openTaskIds: t.tasks.map((x) => x.id),
    urgentUnplanned: urgent,
    mode: t.mode,
  };
}

/** What actually changed between two snapshots, in the student's terms. */
export function diff(prev: Snapshot, next: Snapshot): WatcherEvent[] {
  const out: WatcherEvent[] = [];

  if (next.classCount < prev.classCount) {
    out.push({ kind: "class_removed", headline: "A class came off your calendar", evidence: `${prev.classCount} commitments before, ${next.classCount} now` });
  }

  for (const id of next.gapIds) {
    const before = prev.gapMinutes[id];
    const after = next.gapMinutes[id];
    if (before === undefined) {
      out.push({ kind: "gap_opened", headline: `A ${after}-minute window opened up`, evidence: `${id} was not there on the last look`, gapId: id, minutes: after });
    } else {
      // A window already under way loses a minute every minute, and the clock
      // moving is not an event. Without this the Watcher announces "your
      // window lost 6 minutes" roughly every six minutes, for ever, which is
      // both wrong and the fastest way to make a student stop reading it.
      const drift = next.inProgress?.includes(id) ? Math.max(0, Math.round((next.at - prev.at) / 60000)) : 0;
      const adjusted = after + drift;
      if (adjusted < before - 5) {
        out.push({ kind: "gap_shrank", headline: `Your window lost ${before - adjusted} minutes`, evidence: `${id} went from ${before} to ${after} usable minutes${drift ? `, ${drift} of which is just time passing` : ""}`, gapId: id, minutes: after });
      } else if (adjusted > before + 5) {
        out.push({ kind: "gap_grew", headline: `Your window grew by ${adjusted - before} minutes`, evidence: `${id} went from ${before} to ${after} usable minutes`, gapId: id, minutes: after });
      }
    }
  }
  for (const id of prev.gapIds) {
    if (!next.gapIds.includes(id)) out.push({ kind: "gap_closed", headline: "A window you had is gone", evidence: `${id} no longer exists`, gapId: id });
  }

  if (prev.busLeaveBy !== undefined && next.busLeaveBy !== undefined && next.busLeaveBy < prev.busLeaveBy - 2) {
    out.push({ kind: "bus_slipped", headline: `You need to leave ${prev.busLeaveBy - next.busLeaveBy} minutes earlier`, evidence: `${next.busRoute} moved your leave-by from ${fmt(prev.busLeaveBy)} to ${fmt(next.busLeaveBy)} (${next.busStatus})`, minutes: next.busLeaveBy });
  }

  if (!prev.overCommitted && next.overCommitted) {
    out.push({ kind: "now_overcommitted", headline: "The day stopped fitting", evidence: `slack went from ${prev.slack} to ${next.slack} minutes` });
  } else if (prev.overCommitted && !next.overCommitted) {
    out.push({ kind: "now_fits", headline: "The day fits again", evidence: `slack is back to ${next.slack} minutes` });
  }

  for (const id of next.urgentUnplanned) {
    if (!prev.urgentUnplanned.includes(id)) {
      out.push({ kind: "deadline_unplanned", headline: "Something due tomorrow has nowhere to happen", evidence: `${id} is due inside 24 hours and is not in any window`, taskId: id });
    }
  }

  return out;
}

/** What the Watcher does about one event. Tier B never executes; it queues a proposal. */
export async function decide(e: WatcherEvent): Promise<{ tier: Tier; action: string; reasoning: string; proposal?: Proposal }> {
  const t = await buildToday();
  const gap = e.gapId ? t.gaps.find((x) => x.id === e.gapId) : undefined;

  switch (e.kind) {
    case "class_removed":
      // The windows this opened up arrive as their own gap_opened events, with
      // stable ids. Doubling up here would propose the same room twice.
      return { tier: "A", action: "Re-planned around it", reasoning: "Anything it freed up shows as a new window, and I handle those one at a time." };

    case "gap_grew":
    case "gap_opened": {
      const pick = gap?.pick;
      if (!gap || !pick) return { tier: "A", action: "Left the new window free", reasoning: "Nothing on your list is short enough to fit it, and inventing work to fill a gap is how a planner stops being trusted." };
      // A room is only worth holding for work that needs a desk and a stretch of time.
      const grew = e.kind === "gap_grew";
      const needsDesk = (pick.domain === "build" || pick.domain === "learn") && gap.usable >= 60;
      if (!needsDesk) {
        return { tier: "A", action: `Put ${pick.title} in ${gap.startText}-${gap.endText}`, reasoning: `${pick.title} fits the ${gap.usable} minutes and needs nothing booked, so there is nothing to ask you about.` };
      }
      return {
        tier: "B",
        action: `Put ${pick.title} in the ${gap.usable}-minute block at ${gap.startText} and hold a room in Hillman`,
        reasoning: `${grew ? "That cancellation joined two windows into one stretch" : "A new window opened"} of ${gap.usable} minutes, and ${pick.title} wants ${pick.estimateMinutes}. Holding a room reserves something outside the app, so it is yours to confirm.`,
        proposal: { kind: "book_room", gapId: gap.id, building: "Hillman", reason: `${gap.usable} free minutes opened at ${gap.startText}` },
      };
    }

    case "gap_shrank": {
      const pick = gap?.pick;
      if (!gap) return { tier: "A", action: "Re-checked what fits", reasoning: "The window changed, so the shortlist changed." };
      return {
        tier: "A",
        action: pick ? `Swapped in ${pick.title}, which still fits ${gap.usable} minutes` : `Cleared the window, nothing fits ${gap.usable} minutes now`,
        reasoning: `Only your own screen changes, so I did it rather than asking. ${pick ? `${pick.title} is the largest thing that still fits.` : "Everything on your list is longer than what is left."}`,
      };
    }

    case "bus_slipped":
      return {
        tier: "A",
        action: `Moved your leave-by to ${e.minutes !== undefined ? fmt(e.minutes) : "earlier"}`,
        reasoning: `PRT's own prediction moved, not our estimate, and this only changes what your screen says.`,
      };

    case "now_overcommitted": {
      const cut = t.cuts[0];
      if (!cut) return { tier: "A", action: "Flagged that the day does not fit", reasoning: "Nothing is safe to drop: everything left is either a priority or due soon." };
      return {
        tier: "A",
        action: `Suggested dropping ${cut.task.title}`,
        reasoning: `${cut.reason}, and it buys back ${cut.minutesSaved} minutes. I am only suggesting; nothing is removed until you say so.`,
      };
    }

    case "deadline_unplanned": {
      const task = t.tasks.find((x) => x.id === e.taskId);
      const g3 = t.gaps.find((x) => !x.pick) ?? t.gaps[0];
      if (!task || !g3) return { tier: "A", action: "Raised the deadline", reasoning: "There is no window left today for it." };
      return {
        tier: "B",
        action: `Move ${task.title} into ${g3.startText}-${g3.endText}`,
        reasoning: `It is due inside a day and has nowhere to happen. Rearranging what you already agreed to is yours to confirm.`,
        proposal: { kind: "move_task", taskId: task.id, gapId: g3.id, reason: `due inside 24 hours and unplanned` },
      };
    }

    case "now_fits":
      return { tier: "A", action: "Stood down", reasoning: "You are back inside your budget, so nothing needs doing." };

    case "gap_closed":
      return { tier: "A", action: "Dropped the plan for that window", reasoning: "The window is gone, so what was in it is back on the list." };
  }
}

/** One pass: look, diff, decide, record. Safe to call as often as you like. */
export async function tick(): Promise<{ status: WatcherStatus; fired: TraceEntry[] }> {
  const m = mem();
  const next = await snapshot();

  if (m.state !== "running") {
    m.lastTickAt = next.at;
    return { status: status(m, next), fired: [] };
  }

  const events = m.last ? diff(m.last, next) : [];
  const fired: TraceEntry[] = [];
  const s = store();

  for (const e of events) {
    const d = await decide(e);

    // Nothing reaches the student until the Critic has graded it. The Critic
    // can only ever make this quieter: suppress it, or demote a proposal to a
    // note. It cannot approve, and it cannot promote a Tier B into a Tier A.
    const j = await judge({ kind: e.kind, tier: d.tier, headline: e.headline, evidence: e.evidence, action: d.action, reasoning: d.reasoning });
    record(e.kind, j);

    const mutedKind = isMuted(e.kind);
    const entry: TraceEntry = {
      seq: m.trace.length + 1,
      at: new Date().toISOString(),
      event: e,
      tier: d.tier,
      action: d.action,
      reasoning: d.reasoning,
      applied: d.tier === "A",
      score: j.overall,
      scores: j.scores,
      verdict: mutedKind ? "demote" : j.verdict,
      critique: mutedKind ? `this kind of alert keeps scoring below ${MUTE_BELOW}, so it no longer interrupts` : j.note,
      judgedBy: j.provider,
    };

    if (entry.verdict === "suppress") {
      // Kept in the trace so the failure is visible, but never acted on.
      entry.applied = false;
      m.trace.push(entry);
      log("agent", "watcher_suppressed", { kind: e.kind, score: j.overall, why: j.note });
      continue;
    }

    const proposeIt = d.tier === "B" && d.proposal && entry.verdict === "keep";
    if (proposeIt) {
      const already = s.proposals.some((p) => p.status === "pending" && JSON.stringify(p.proposal) === JSON.stringify(d.proposal));
      if (!already) {
        const stored = { id: crypto.randomUUID(), proposal: d.proposal!, status: "pending" as const, createdAt: new Date().toISOString() };
        s.proposals.push(stored);
        entry.proposalId = stored.id;
      } else {
        entry.action += " (already waiting on you)";
      }
    } else if (d.tier === "B") {
      entry.action += " — left as a note, not an ask";
    }

    m.trace.push(entry);
    fired.push(entry);
    log("agent", "watcher_fired", { kind: e.kind, tier: d.tier, action: d.action, score: j.overall, verdict: entry.verdict });
  }

  m.last = next;
  m.ticks += 1;
  m.lastTickAt = next.at;
  return { status: status(m, next), fired };
}

function status(m: WatcherMemory, s?: Snapshot): WatcherStatus {
  return {
    state: m.state,
    ticks: m.ticks,
    lastTickAt: m.lastTickAt ? new Date(m.lastTickAt).toISOString() : undefined,
    lastTickText: s ? `${s.gapIds.length} windows, ${s.slack} min of slack${s.busRoute ? `, ${s.busRoute} at ${s.busLeaveBy !== undefined ? fmt(s.busLeaveBy) : "?"}` : ""}` : undefined,
    trace: m.trace.slice(-12).reverse(),
    watching: WATCHING,
  };
}

export function watcherStatus(): WatcherStatus {
  return status(mem(), mem().last);
}
