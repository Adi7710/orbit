import { store } from "./store";
import { computeLedger, suggestCuts } from "@/core/ledger";
import { bestFit, findGaps } from "@/core/gaps";
import { questsForDay } from "@/core/game";
import { sharedGaps } from "@/core/overlap";
import { busQuestForGap, ghostTrips, leaveBy } from "@/core/bus";
import { upcomingArrivals } from "@/services/prt";
import { fmt, fromDate } from "@/core/time";
import { MODE_RULES } from "@/core/types";

/** Everything the Today screen needs, computed from the deterministic core. */
export async function buildToday() {
  const s = store();
  const horizon = MODE_RULES[s.mode].horizonHours;
  const now = new Date();
  const liveTasks = s.tasks.filter((t) => !t.completedAt).filter((t) => {
    if (s.mode === "crisis") return t.domain === "learn" || t.domain === "build";
    if (s.mode === "chill") return t.dueAt ? (t.dueAt.getTime() - now.getTime()) / 36e5 <= (horizon ?? 48) : false;
    return true;
  });

  const ledger = computeLedger(s.blocks, s.profile, s.travel, liveTasks, s.estimator);
  const gaps = findGaps(s.blocks, s.profile, s.travel);
  const picks = new Map(gaps.map((g) => [g.id, bestFit(g, liveTasks, s.estimator)] as const));
  // Avoid offering the same task in two gaps.
  const seen = new Set<string>();
  for (const [id, task] of picks) {
    if (task && seen.has(task.id)) picks.set(id, undefined);
    if (task) seen.add(task.id);
  }

  const arrivals = await upcomingArrivals(["forbes-bigelow"]);
  const nowMin = fromDate(now, "America/New_York");
  const nextClass = s.blocks.filter((b) => b.start > nowMin).sort((a, b) => a.start - b.start)[0];
  const bus = leaveBy(nowMin, 6, arrivals, nextClass?.start, 12);
  const ghosts = ghostTrips(arrivals, arrivals.filter((a) => a.realtime));
  const busQuest = gaps[0] ? busQuestForGap(gaps[0], 6, arrivals, 12) : undefined;
  const quests = questsForDay(gaps, picks, busQuest ? { ...busQuest, leaveBy: busQuest.leaveBy } : undefined);
  const shared = sharedGaps(gaps, s.friends);
  const cuts = ledger.overCommitted ? suggestCuts(liveTasks, -ledger.slack, new Set(s.profile.priorityDomains), s.estimator) : [];

  return {
    mode: s.mode,
    user: s.user,
    ledger,
    gaps: gaps.map((g) => ({ ...g, startText: fmt(g.start), endText: fmt(g.end), pick: picks.get(g.id) ?? null })),
    quests: quests.map((q) => ({ ...q, expiresText: fmt(q.expiresAt) })),
    bus: bus ? { ...bus, leaveByText: fmt(bus.leaveBy), arrivalText: fmt(bus.arrival) } : null,
    ghosts,
    arrivals: arrivals.map((a) => ({ ...a, text: fmt(a.arrivalMinutes) })),
    shared: shared.map((w) => ({ ...w, startText: fmt(w.start), endText: fmt(w.end), names: w.userIds.map((id) => s.friends.find((f) => f.userId === id)?.name ?? id) })),
    tasks: liveTasks.map((t) => ({ ...t, planningMinutes: s.estimator.planningMinutes(t) })),
    cuts,
    calibration: s.estimator.calibration(),
    proposals: s.proposals,
    events: s.events.slice(-30).reverse(),
  };
}
