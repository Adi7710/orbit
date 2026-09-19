/**
 * Every fact Orbit is allowed to say, with a key and a source.
 *
 * This is the whole grounding mechanism for open questions. The Ask agent is
 * never handed the store, the calendar or the history -- it is handed this
 * list, and an answer containing a number that is not in it is rejected before
 * anyone sees it.
 *
 * That inversion is the point. Most assistants are grounded by asking a model
 * nicely to stick to the context. Here the context is enumerable, every fact
 * carries the id of where it came from, and the check afterwards is arithmetic
 * rather than a second opinion.
 */

export interface Fact {
  /** Stable id, used by the question bank to assert the right fact was used. */
  key: string;
  /** One sentence a person could read aloud. */
  text: string;
  /** Numbers this fact licenses an answer to contain. */
  numbers: number[];
  /** Where it came from, so the answer can defend itself. */
  source: string;
}

const n = (...xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

/** Shape of what buildToday() returns; kept structural so core stays free of app imports. */
export interface TodayLike {
  mode: string;
  user?: { name?: string; xpWeek?: number; streakWeeks?: number; group?: string };
  ledger: { usable: number; naiveFree: number; travel: number; meals: number; routines: number; fixed: number; queued: number; slack: number; overCommitted: boolean };
  gaps: { id: string; startText: string; endText: string; usable: number; pick: { title: string; estimateMinutes: number } | null }[];
  tasks: { id: string; title: string; planningMinutes: number; estimateMinutes: number; courseCode?: string; dueAt?: Date | string }[];
  bus: { route: string; leaveByText: string; departsText: string; arrivalText: string; status: string; rideMinutes: number; walkToStop: number; from: string; to: string; verdict: { makesIt: boolean; marginMin: number } | null; classAtText: string | null } | null;
  calibration: { key: string; samples: number; multiplier: number }[];
  quests?: { title: string; xp: number }[];
  cuts?: { task: { title: string }; minutesSaved: number }[];
  transit?: { clockText: string; realtimeOk: boolean };
}

export function buildFactsheet(t: TodayLike): Fact[] {
  const f: Fact[] = [];
  const L = t.ledger;

  f.push({
    key: "ledger.usable",
    text: `You have ${L.usable} usable minutes today, against the ${L.naiveFree} your calendar claims are free.`,
    numbers: n(L.usable, L.naiveFree),
    source: "computeLedger in src/core/ledger.ts",
  });
  f.push({
    key: "ledger.missing",
    text: `The ${L.naiveFree - L.usable} minutes your calendar does not count are ${L.travel} walking, ${L.meals} eating and ${L.routines} settling in.`,
    numbers: n(L.naiveFree - L.usable, L.travel, L.meals, L.routines),
    source: "computeLedger: awake minus classes, travel, meals and routines",
  });
  f.push({
    key: "ledger.commitment",
    text: L.overCommitted
      ? `You are over-committed: ${L.queued} minutes of work against ${L.usable} usable, which is ${Math.abs(L.slack)} minutes short.`
      : `Your work fits: ${L.queued} minutes queued against ${L.usable} usable, ${L.slack} to spare.`,
    numbers: n(L.queued, L.usable, L.slack, Math.abs(L.slack)),
    source: "ledger slack = usable - queued",
  });
  f.push({ key: "mode", text: `You are in ${t.mode} mode.`, numbers: [], source: "store mode" });

  t.gaps.forEach((g, i) => {
    f.push({
      key: `gap.${g.id}`,
      text: `Window ${i + 1} runs ${g.startText} to ${g.endText} and has ${g.usable} usable minutes${g.pick ? `, with ${g.pick.title} placed in it` : " and nothing placed in it"}.`,
      numbers: n(g.usable, i + 1),
      source: `findGaps, window id ${g.id}`,
    });
  });
  if (t.gaps[0]) {
    f.push({ key: "gap.best", text: `Your best window today is ${t.gaps[0].startText} to ${t.gaps[0].endText}, ${t.gaps[0].usable} minutes.`, numbers: n(t.gaps[0].usable), source: "first window by size from findGaps" });
  }

  f.push({
    key: "tasks.count",
    text: `You have ${t.tasks.length} things still to do${t.tasks[0] ? `, the nearest being ${t.tasks[0].title}` : ""}.`,
    numbers: n(t.tasks.length),
    source: "open tasks in the store",
  });
  for (const task of t.tasks.slice(0, 12)) {
    f.push({
      key: `task.${task.id}`,
      text: `${task.title}${task.courseCode ? ` (${task.courseCode})` : ""} is planned at ${task.planningMinutes} minutes; the raw estimate is ${task.estimateMinutes}${task.dueAt ? `, and it is due ${new Date(task.dueAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}` : ""}.`,
      numbers: n(task.planningMinutes, task.estimateMinutes),
      source: `task ${task.id}, planning minutes from Estimator`,
    });
  }

  for (const c of t.calibration) {
    f.push({
      key: `calibration.${c.key}`,
      text: `For ${c.key.replace("::", " ")} your work takes ${c.multiplier.toFixed(2)} times what you estimate, measured over ${c.samples} finished sessions.`,
      numbers: n(+c.multiplier.toFixed(2), c.samples),
      source: `Estimator: ${c.samples} samples, trimmed, capped at 3x`,
    });
  }

  if (t.bus) {
    const b = t.bus;
    f.push({
      key: "bus.leave",
      text: `To get from ${b.from} to ${b.to} you should leave at ${b.leaveByText} for the ${b.route}, which departs ${b.departsText} and arrives ${b.arrivalText}.`,
      numbers: [],
      source: `buildJourney, ${b.status} data from Pittsburgh Regional Transit`,
    });
    f.push({ key: "bus.legs", text: `That trip is ${b.walkToStop} minutes walking to the stop and ${b.rideMinutes} minutes riding.`, numbers: n(b.walkToStop, b.rideMinutes), source: "buildJourney leg times" });
    if (b.verdict) {
      f.push({
        key: "bus.verdict",
        text: b.verdict.makesIt
          ? `You make it with ${b.verdict.marginMin} minutes to spare.`
          : `You miss it by ${Math.abs(b.verdict.marginMin)} minutes.`,
        numbers: n(Math.abs(b.verdict.marginMin)),
        source: "arrival compared against the class start time",
      });
    } else {
      // The absence is a fact too. Without it, "will I make it to class on
      // time?" on an evening with no class left had nothing to match and was
      // answered out of the calibration facts -- confidently, about the wrong
      // thing. Orbit has to be able to say that there is nothing to be late for.
      f.push({
        key: "bus.noclass",
        text: `There is no class left to catch today, so there is nothing to be late for; this trip is ${b.from} to ${b.to}.`,
        numbers: [],
        source: "no upcoming class block after the current time",
      });
    }
  }

  if (t.user) {
    f.push({
      key: "xp",
      text: `You have ${t.user.xpWeek ?? 0} XP this week and a ${t.user.streakWeeks ?? 0} week streak.`,
      numbers: n(t.user.xpWeek, t.user.streakWeeks),
      source: "server-side XP, capped at 150 per task and 400 per day",
    });
  }
  for (const c of t.cuts ?? []) {
    f.push({ key: `cut.${c.task.title}`, text: `Dropping ${c.task.title} would give back ${c.minutesSaved} minutes.`, numbers: n(c.minutesSaved), source: "suggestCuts in src/core/ledger.ts" });
  }
  if (t.transit) {
    f.push({ key: "clock", text: `It is ${t.transit.clockText}, and the live transit feed is ${t.transit.realtimeOk ? "up" : "down"}.`, numbers: [], source: "PRT GTFS-realtime" });
  }

  return f;
}

/**
 * Everything the factsheet licenses, as a set, for the verifier.
 *
 * Declared numbers *and* every number appearing in a fact's own sentence. The
 * factsheet is the ground truth by definition, so a figure printed in it is
 * licensed whether or not the fact bothered to declare it. Without this the
 * verifier reads the 4 in "Problem Set 4" and the 61 in "the 61B" as invented
 * claims, throws away four perfectly correct answers, and reports a grounding
 * failure that never happened -- which is worse than useless, because it hides
 * the real ones.
 */
export function licensedNumbers(facts: Fact[]): Set<number> {
  const s = new Set<number>();
  for (const f of facts) {
    for (const x of f.numbers) s.add(x);
    for (const m of f.text.match(/\d+(?:\.\d+)?/g) ?? []) s.add(Number(m));
  }
  return s;
}
