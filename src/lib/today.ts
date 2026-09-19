import { store } from "./store";
import { computeLedger, suggestCuts } from "@/core/ledger";
import { bestFit, findGaps } from "@/core/gaps";
import { questsForDay } from "@/core/game";
import { sharedGaps } from "@/core/overlap";
import { fmt } from "@/core/time";
import { MODE_RULES } from "@/core/types";
import { planLeg, PLACES } from "./transit";
import { clock } from "@/services/prt";

/** Everything the Today screen needs, computed from the deterministic core plus the real PRT schedule. */
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
  const seen = new Set<string>();
  for (const [id, task] of picks) {
    if (task && seen.has(task.id)) picks.set(id, undefined);
    if (task) seen.add(task.id);
  }

  // Transit: the two legs a commuting student cares about, on the real timetable.
  const c = clock();
  const ordered = [...s.blocks].sort((a, b) => a.start - b.start);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const nowMin = Math.floor(c.sec / 60);
  const morning = first && first.place && first.place in PLACES && nowMin < first.start ? await planLeg("Home", first.place as keyof typeof PLACES, first.start * 60) : undefined;
  const evening = last && last.place && last.place in PLACES ? await planLeg(last.place as keyof typeof PLACES, "Home") : undefined;
  const activeLeg = morning?.options.length ? morning : evening;
  const best = activeLeg?.options.find((o) => o.status === "live") ?? activeLeg?.options[0];

  const busQuest = evening?.options[0] && gaps.length ? { gapId: gaps[gaps.length - 1].id, leaveBy: evening.options[0].leaveBy, route: evening.options[0].route } : undefined;
  const quests = questsForDay(gaps, picks, busQuest);
  const shared = sharedGaps(gaps, s.friends);
  const cuts = ledger.overCommitted ? suggestCuts(liveTasks, -ledger.slack, new Set(s.profile.priorityDomains), s.estimator) : [];

  return {
    mode: s.mode,
    user: s.user,
    ledger,
    gaps: gaps.map((g) => ({ ...g, startText: fmt(g.start), endText: fmt(g.end), pick: picks.get(g.id) ?? null })),
    quests: quests.map((q) => ({ ...q, expiresText: fmt(q.expiresAt) })),
    bus: best && activeLeg
      ? { route: best.route, leaveByText: best.leaveByText, arrivalText: best.arriveText, ghost: best.status === "ghost", live: best.status === "live", from: activeLeg.from, to: activeLeg.to, stopName: activeLeg.boardStopName, walkToStop: activeLeg.walkToStop, rideMinutes: activeLeg.rideMinutes, delaySec: best.delaySec }
      : null,
    arrivals: (activeLeg?.options ?? []).map((o) => ({ route: o.route, text: o.departsText, realtime: o.status === "live", status: o.status, headsign: o.headsign })),
    ghosts: (activeLeg?.options ?? []).filter((o) => o.status === "ghost").map((o) => ({ route: o.route })),
    transit: { clockText: activeLeg?.clockText ?? fmt(nowMin), simulated: c.simulated, realtimeOk: activeLeg?.realtimeOk ?? false, morning, evening },
    shared: shared.map((w) => ({ ...w, startText: fmt(w.start), endText: fmt(w.end), names: w.userIds.map((id) => s.friends.find((f) => f.userId === id)?.name ?? id) })),
    tasks: liveTasks.map((t) => ({ ...t, planningMinutes: s.estimator.planningMinutes(t) })),
    cuts,
    calibration: s.estimator.calibration(),
    proposals: s.proposals,
    events: s.events.slice(-30).reverse(),
  };
}
