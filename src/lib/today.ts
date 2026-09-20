import { store } from "./store";
import { computeLedger, suggestCuts } from "@/core/ledger";
import { bestFit, findGaps } from "@/core/gaps";
import { questsForDay } from "@/core/game";
import { sharedGaps } from "@/core/overlap";
import { fmt, fromDate } from "@/core/time";
import { MODE_RULES } from "@/core/types";
import { buildJourney, BUILDINGS } from "./journey";
import { clock } from "@/services/prt";
import { transitNeed } from "@/core/transitRelevance";
import { REGION } from "@/services/schedule";

/** Who publishes the timetable we just quoted, per region. */
const AGENCY = {
  hudson: "NJ TRANSIT and the Port Authority of New York and New Jersey",
  oakland: "Pittsburgh Regional Transit",
} as const;

const isPlace = (p?: string): p is keyof typeof BUILDINGS => !!p && p in BUILDINGS;

/**
 * Everything the Today screen needs.
 *
 * The bus block comes from the same buildJourney() the map screen uses, so the
 * card and the map can never disagree about when to leave. Two code paths
 * computing the same time is how a demo ends up showing 14:02 on one screen
 * and 14:07 on the next.
 */
export async function buildToday(opts?: { to?: string }) {
  const s = store();
  const horizon = MODE_RULES[s.mode].horizonHours;
  const now = new Date();
  const liveTasks = s.tasks.filter((t) => !t.completedAt).filter((t) => {
    if (s.mode === "crisis") return t.domain === "learn" || t.domain === "build";
    if (s.mode === "chill") return t.dueAt ? (t.dueAt.getTime() - now.getTime()) / 36e5 <= (horizon ?? 48) : false;
    return true;
  });

  // Resolved before the windows are built, because a plan written at wake and
  // never moved will still be offering this morning's window at seven at night.
  const c = clock();
  const nowMin = Math.floor(c.sec / 60);

  const ledger = computeLedger(s.blocks, s.profile, s.travel, liveTasks, s.estimator);
  const gaps = findGaps(s.blocks, s.profile, s.travel, nowMin);
  const picks = new Map(gaps.map((g) => [g.id, bestFit(g, liveTasks, s.estimator)] as const));
  const seen = new Set<string>();
  for (const [id, task] of picks) {
    if (task && seen.has(task.id)) picks.set(id, undefined);
    if (task) seen.add(task.id);
  }

  // Which leg matters right now: getting to the next class, or getting home
  // after the last one.
  const ordered = [...s.blocks].sort((a, b) => a.start - b.start);
  const nextClass = ordered.find((b) => b.start > nowMin && isPlace(b.place));
  const lastClass = [...ordered].reverse().find((b) => isPlace(b.place));

  // The timeline the clients draw. Status and progress are decided here, never
  // on the device: clock() may be the simulated demo clock, so a phone asking
  // Date() mid-rehearsal would mark the 2:30 seminar finished at seven in the
  // evening. Additive field; the web page ignores it.
  const firstUpcoming = ordered.find((b) => b.start > nowMin);
  const timeline = ordered.map((b) => ({
    id: b.id,
    title: b.title,
    kind: b.kind,
    courseCode: b.courseCode ?? null,
    place: b.place ?? null,
    startText: fmt(b.start),
    endText: fmt(b.end),
    minutes: b.end - b.start,
    status:
      b.end <= nowMin ? "done"
      : b.start <= nowMin ? "now"
      : b.id === firstUpcoming?.id ? "next"
      : "later",
    progress: b.start <= nowMin && nowMin < b.end ? +((nowMin - b.start) / (b.end - b.start)).toFixed(3) : null,
    remainingMinutes: b.start <= nowMin && nowMin < b.end ? b.end - nowMin : null,
  }));

  // Demand-driven: a bus is worked out when there is a reason to catch one,
  // not on every load of Today. Idle means no protobuf feeds fetched, no route
  // solved, and no bus card on a screen where a bus is not the answer.
  const need = transitNeed({ nowMin, blocks: s.blocks, askedFor: opts?.to, isPlace });
  const goingToClass = need.reason === "class" || (need.reason === "asked" && need.to !== "Home");

  // A trip needs a destination. transitNeed always supplies one for "class"
  // and "asked", so the guard is belt-and-braces -- but the old fallback was
  // a hardcoded "Cathedral", which is a building in Pittsburgh, and a
  // Pittsburgh building in a New Jersey journey is not a default, it is a bug
  // waiting for the one code path that reaches it.
  const leg = !need.needed || (need.reason !== "home" && !need.to)
    ? undefined
    : need.reason === "home"
      ? { from: (need.block?.place ?? lastClass?.place) as keyof typeof BUILDINGS, to: "Home" as const, arriveBySec: undefined, why: "home after your last class" }
      : {
          from: "Home" as const,
          to: need.to as keyof typeof BUILDINGS,
          arriveBySec: need.block ? need.block.start * 60 : undefined,
          why: need.block ? `to ${need.block.title}` : `to ${need.to}`,
        };

  const journey = leg ? await buildJourney({ from: leg.from, to: leg.to, arriveBySec: leg.arriveBySec, now: c }) : undefined;
  const o = journey?.options[0];

  const busQuest = o && gaps.length ? { gapId: gaps[gaps.length - 1].id, leaveBy: Math.floor(o.leaveBySec / 60), route: o.route } : undefined;
  const quests = questsForDay(gaps, picks, busQuest);
  const shared = sharedGaps(gaps, s.friends);
  const cuts = ledger.overCommitted ? suggestCuts(liveTasks, -ledger.slack, new Set(s.profile.priorityDomains), s.estimator) : [];

  return {
    mode: s.mode,
    user: s.user,
    ledger,
    blocks: timeline,
    gaps: gaps.map((g) => ({ ...g, startText: fmt(g.start), endText: fmt(g.end), pick: picks.get(g.id) ?? null })),
    quests: quests.map((q) => ({ ...q, expiresText: fmt(q.expiresAt) })),
    bus: journey && o && leg
      ? {
          route: o.route,
          headsign: o.headsign,
          leaveBySec: o.leaveBySec,
          leaveByText: o.leaveByText,
          departsText: o.departsText,
          arrivalText: o.arriveText,
          status: o.status,
          live: o.status === "live",
          ghost: o.status === "ghost",
          delaySec: o.delaySec,
          from: leg.from,
          to: leg.to,
          why: leg.why,
          stopName: journey.boardStop.name,
          alightName: journey.alightStop.name,
          walkToStop: journey.walkToStop.minutes,
          walkToDest: journey.walkToDest.minutes,
          rideMinutes: o.rideMinutes,
          vehicleKm: o.vehicle ? +(o.vehicle.metersToStop / 1000).toFixed(1) : null,
          verdict: journey.destination.arriveByText ? o.verdict : null,
          classAtText: journey.destination.arriveByText ?? null,
          /** Deep link into the full map with this exact leg selected. */
          mapHref: `/map?from=${leg.from}&to=${leg.to}${journey.destination.arriveByText ? `&arriveBy=${journey.destination.arriveByText}` : ""}`,
        }
      : null,
    arrivals: (journey?.options ?? []).map((x) => ({
      route: x.route, text: x.departsText, realtime: x.status === "live", status: x.status, headsign: x.headsign,
      leaveByText: x.leaveByText, arriveText: x.arriveText,
      // Null verdict means there is nothing to be late for, which is not the
      // same as making it. Clients must be able to tell those apart.
      makesIt: x.verdict?.makesIt ?? null, marginMin: x.verdict?.marginMin ?? null,
      totalMinutes: x.totalMinutes, waitMinutes: x.waitMinutes,
    })),
    ghosts: (journey?.options ?? []).filter((x) => x.status === "ghost").map((x) => ({ route: x.route })),
    transit: {
      clockText: fmt(nowMin),
      simulated: c.simulated,
      realtimeOk: journey?.realtime.tripsOk ?? false,
      walkSource: journey?.walkToStop.source ?? "estimate",
      // Why there is or is not a bus, so a client shows a sentence rather than
      // an empty card, and nobody has to guess whether it is broken or idle.
      reason: need.reason,
      why: need.why,
      planned: need.needed,
      // Named here, where the region is known, so nothing downstream has to
      // guess. The factsheet used to hardcode "Pittsburgh Regional Transit"
      // into the source of every bus fact, which meant Orbit defended a
      // Hoboken light rail departure by citing an agency in another state --
      // in the one feature built to prove it is not bluffing.
      agency: AGENCY[REGION],
      alerts: journey?.alerts ?? [],
      alertsOk: journey?.realtime.alertsOk ?? false,
    },
    shared: shared.map((w) => ({ ...w, startText: fmt(w.start), endText: fmt(w.end), names: w.userIds.map((id) => s.friends.find((f) => f.userId === id)?.name ?? id) })),
    tasks: liveTasks.map((t) => ({ ...t, planningMinutes: s.estimator.planningMinutes(t) })),
    cuts,
    calibration: s.estimator.calibration(),
    proposals: s.proposals,
    events: s.events.slice(-30).reverse(),
  };
}

export { fromDate };
