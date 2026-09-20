import type { Gap } from "./gaps";
import { MIN_USABLE } from "./gaps";
import { bestFit } from "./gaps";
import { Estimator } from "./estimator";
import { MODE_RULES, type Mode, type Task } from "./types";

/**
 * The three modes as data, not as three code paths.
 *
 * Orbit already had a mode switch, but it only reached two things: which
 * domains count and how far ahead to look. Everything else about a day --
 * how small a window has to be before it is a coffee rather than a work
 * session, whether a deadline is a quiet line or the thing that plans your
 * day, whether you are shown a need-versus-have meter -- was the same in all
 * three, so "crisis" and "chill" were labels on an identical screen.
 *
 * One config object per mode, read by the day builder. Adding a mode is a new
 * entry here, not a new branch in five files.
 */

/** How template quests are placed into the day's windows. */
export type QuestStrategy =
  | "one-per-gap"           // Normal: the original greedy assignment
  | "largest-gap-optional"  // Chill: one optional thing, in the biggest window
  | "deadline-blocks";      // Crisis: no templates; deadlines place the work

/** How deadlines surface. */
export type DeadlineMode = "quiet-line" | "due-soon-card" | "drive-day";

/** When the need-versus-have meter is shown. */
export type FeasibilityMode = "off" | "suggest-on-shortfall" | "always";

/** How prominent the leave-by times are. */
export type LeaveByMode = "first-only" | "banner-all" | "top-bar-all";

/** What the end of the day is summarised as. */
export type WrapUpMode = "two-lines" | "standard" | "deadline-summary";

export interface ModeConfig {
  id: Mode;
  name: string;
  difficulty: "Easy" | "Standard" | "Hard";
  /** The one line the mode picker shows. */
  promise: string;
  /** A window must have at least this many usable minutes to hold anything. */
  minUsableGap: number;
  quests: {
    strategy: QuestStrategy;
    /** Cap on placed quests. null means one per real window. */
    maxPerDay: number | null;
    /** Whether what is placed is framed as optional. */
    optional: boolean;
  };
  deadlines: {
    mode: DeadlineMode;
    /** Only surface deadlines due within this many hours. null means all of them. */
    horizonHours: number | null;
    /** Whether deadlines place work blocks and drive the day. */
    drivesAssignment: boolean;
  };
  feasibility: FeasibilityMode;
  leaveBy: LeaveByMode;
  wrapUp: WrapUpMode;
  /** One short recovery break per this many minutes of work. null means none offered. */
  restBreakPerMin: number | null;
}

export const DEFAULT_MODE: Mode = "normal";

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  chill: {
    id: "chill",
    name: "Chill",
    difficulty: "Easy",
    promise: "See your day honestly. Do one small thing if you feel like it.",
    minUsableGap: 40,
    quests: { strategy: "largest-gap-optional", maxPerDay: 1, optional: true },
    deadlines: { mode: "quiet-line", horizonHours: 72, drivesAssignment: false },
    feasibility: "off",
    leaveBy: "first-only",
    wrapUp: "two-lines",
    restBreakPerMin: null,
  },
  normal: {
    id: "normal",
    name: "Normal",
    difficulty: "Standard",
    promise: "A planned day, one quest in every real gap.",
    // Deliberately Orbit's own MIN_USABLE and not the 25-versus-20 argument.
    // Normal has to reproduce today's output exactly or demo beat 2 changes
    // under us on submission morning; a parity test pins that.
    minUsableGap: MIN_USABLE,
    quests: { strategy: "one-per-gap", maxPerDay: null, optional: false },
    deadlines: { mode: "due-soon-card", horizonHours: null, drivesAssignment: false },
    feasibility: "suggest-on-shortfall",
    leaveBy: "banner-all",
    wrapUp: "standard",
    restBreakPerMin: null,
  },
  crisis: {
    id: "crisis",
    name: "Crisis",
    difficulty: "Hard",
    promise: "Everything that is due, in the order that gets it done.",
    minUsableGap: 12,
    quests: { strategy: "deadline-blocks", maxPerDay: null, optional: false },
    deadlines: { mode: "drive-day", horizonHours: null, drivesAssignment: true },
    feasibility: "always",
    leaveBy: "top-bar-all",
    wrapUp: "deadline-summary",
    restBreakPerMin: 180,
  },
};

export const modeConfig = (mode: Mode): ModeConfig => MODE_CONFIG[mode] ?? MODE_CONFIG[DEFAULT_MODE];

export interface Assignment {
  /** Gap id -> the task placed in it. Absent means the window is left free. */
  picks: Map<string, Task | undefined>;
  /** True when what was placed is a suggestion rather than the plan. */
  optional: boolean;
}

/**
 * How a single window chooses from what it is offered.
 *
 * Injected rather than fixed, because *which* task wins a window is the
 * learning engine's business, not the mode's. The day builder passes a picker
 * that already applies what the weekly review knows about this student -- the
 * per-gap planner and the domains they have quietly never touched -- and this
 * module only decides which windows get offered anything at all.
 */
export type PickFor = (gap: Gap, candidates: Task[]) => Task | undefined;

const defaultPicker = (estimator = new Estimator()): PickFor => (gap, candidates) => bestFit(gap, candidates, estimator);

/**
 * Place tasks into windows the way this mode wants them placed.
 *
 * `one-per-gap` walks the day in order and lets each window choose from what
 * the earlier ones left. Scoring every window independently and then blanking
 * the repeats is the version that leaves an empty evening whenever the same
 * soonest-due task wins twice.
 */
export function assignQuestsForMode(gaps: Gap[], tasks: Task[], config: ModeConfig, pickFor: PickFor = defaultPicker()): Assignment {
  const picks = new Map<string, Task | undefined>();
  const live = tasks.filter((t) => !t.completedAt);

  if (config.quests.strategy === "deadline-blocks") {
    // Nothing template-driven. In Crisis the deadlines place the work, and
    // offering a gym quest beside three overdue problem sets is the app
    // arguing with the student about what today is.
    for (const g of gaps) picks.set(g.id, undefined);
    return { picks, optional: false };
  }

  if (config.quests.strategy === "largest-gap-optional") {
    for (const g of gaps) picks.set(g.id, undefined);
    const biggest = [...gaps].sort((a, b) => b.usable - a.usable)[0];
    if (biggest) {
      const pick = pickFor(biggest, live);
      if (pick) picks.set(biggest.id, pick);
    }
    return { picks, optional: config.quests.optional };
  }

  const used = new Set<string>();
  let placed = 0;
  for (const g of gaps) {
    const cap = config.quests.maxPerDay;
    if (cap !== null && placed >= cap) { picks.set(g.id, undefined); continue; }
    const pick = pickFor(g, live.filter((t) => !used.has(t.id)));
    picks.set(g.id, pick);
    if (pick) { used.add(pick.id); placed++; }
  }
  return { picks, optional: config.quests.optional };
}


/**
 * What this mode measures, and what it is allowed to say at the end of the day.
 *
 * Every field on ModeConfig is read here or by the day builder. A law that is
 * declared and never applied is worse than no law: it reads like a promise the
 * screen is keeping when nothing is keeping it. `MODE_LAWS_APPLIED` below is
 * the guard that keeps that true, and a test fails if a field is added to the
 * config without anything acting on it.
 *
 * The one number deliberately absent is the honest ledger. It is computed
 * identically in every mode and always shown; modes change what is asked and
 * what is emphasised, never the underlying truth. A test pins that too.
 */
export interface ModeStats {
  mode: Mode;
  /** How small a window had to be to count, and what that admitted. */
  minUsableGap: number;
  windows: number;
  windowMinutes: number;
  /** What the mode actually placed, and whether it was a suggestion. */
  placed: number;
  placedMinutes: number;
  optional: boolean;
  /** Deadlines inside this mode's horizon, and how the work sits against them. */
  deadlinesInHorizon: number;
  horizonHours: number | null;
  workBlocks: number;
  workBlockMinutes: number;
  /** Whether the meter is on screen for this day under this mode's policy. */
  meterShown: boolean;
  shortfallMin: number;
  /** Crisis earns a short recovery break per restBreakPerMin of placed work. */
  restBreaksEarned: number;
  /** Chill and Crisis do not award XP; only Normal does. */
  awardsXP: boolean;
  leaveBy: LeaveByMode;
  wrapUp: WrapUpMode;
}

export interface ModeStatsInput {
  gaps: { usable: number }[];
  placedMinutes: number;
  placed: number;
  optional: boolean;
  deadlinesInHorizon: number;
  workBlocks: { minutes: number }[];
  shortfallMin: number;
  /** Null when the mode never computes one. */
  hasFeasibility: boolean;
}

export function modeStats(config: ModeConfig, input: ModeStatsInput): ModeStats {
  const windowMinutes = input.gaps.reduce((n, g) => n + g.usable, 0);
  const workBlockMinutes = input.workBlocks.reduce((n, b) => n + b.minutes, 0);
  const meterShown =
    input.hasFeasibility &&
    (config.feasibility === "always" || (config.feasibility === "suggest-on-shortfall" && input.shortfallMin > 0));
  // Work actually on the plan, however this mode put it there.
  const working = config.quests.strategy === "deadline-blocks" ? workBlockMinutes : input.placedMinutes;
  return {
    mode: config.id,
    minUsableGap: config.minUsableGap,
    windows: input.gaps.length,
    windowMinutes,
    placed: input.placed,
    placedMinutes: input.placedMinutes,
    optional: input.optional,
    deadlinesInHorizon: input.deadlinesInHorizon,
    horizonHours: config.deadlines.horizonHours,
    workBlocks: input.workBlocks.length,
    workBlockMinutes,
    meterShown,
    shortfallMin: input.shortfallMin,
    restBreaksEarned: config.restBreakPerMin ? Math.floor(working / config.restBreakPerMin) : 0,
    awardsXP: MODE_RULES[config.id].awardsXP,
    leaveBy: config.leaveBy,
    wrapUp: config.wrapUp,
  };
}

/** The end of the day, in the shape this mode is allowed to say it. */
export function wrapUpLine(stats: ModeStats): string {
  switch (stats.wrapUp) {
    case "two-lines":
      return stats.placed > 0
        ? `One thing was on offer today. ${stats.windowMinutes} minutes of real windows either way.`
        : `Nothing was on offer today. ${stats.windowMinutes} minutes of real windows either way.`;
    case "deadline-summary":
      return stats.shortfallMin > 0
        ? `${stats.deadlinesInHorizon} due, ${stats.workBlockMinutes} min of work placed, still ${stats.shortfallMin} min short. Start with the tightest tomorrow.`
        : `${stats.deadlinesInHorizon} due and all of it fits: ${stats.workBlockMinutes} min placed across ${stats.workBlocks} blocks.`;
    default:
      return `${stats.placed} of ${stats.windows} windows had something in them, ${stats.placedMinutes} of ${stats.windowMinutes} minutes planned.`;
  }
}

/**
 * Every law on ModeConfig, and where it is applied. The guard that stops a
 * field being declared and quietly doing nothing -- their `validateLayouts()`,
 * for configuration rather than layout.
 */
export const MODE_LAWS_APPLIED: Record<keyof Omit<ModeConfig, "id" | "name" | "difficulty" | "promise">, string> = {
  minUsableGap: "findGaps threshold in buildToday, and reported by modeStats",
  quests: "assignQuestsForMode strategy, cap and optionality",
  deadlines: "deadlinesWithinHorizon, assignWorkBlocks, and the deadline presentation on both clients",
  feasibility: "computeFeasibility is skipped when off; modeStats.meterShown decides the screen",
  leaveBy: "carried to both clients as modeConfig.leaveBy and reported by modeStats",
  wrapUp: "wrapUpLine, and reported to both clients as modeConfig.wrapUp",
  restBreakPerMin: "modeStats.restBreaksEarned",
};
