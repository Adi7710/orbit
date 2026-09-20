import type { Gap } from "./gaps";
import { MIN_USABLE } from "./gaps";
import { bestFit } from "./gaps";
import { Estimator } from "./estimator";
import type { Mode, Task } from "./types";

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
 * Place tasks into windows the way this mode wants them placed.
 *
 * `one-per-gap` is the original assignment, lifted unchanged including the
 * de-duplication pass: the same task must not be offered in two windows,
 * because a student who does it once has then "missed" it everywhere else.
 */
export function assignQuestsForMode(gaps: Gap[], tasks: Task[], config: ModeConfig, estimator = new Estimator()): Assignment {
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
      const pick = bestFit(biggest, live, estimator);
      if (pick) picks.set(biggest.id, pick);
    }
    return { picks, optional: config.quests.optional };
  }

  const seen = new Set<string>();
  let placed = 0;
  for (const g of gaps) {
    const cap = config.quests.maxPerDay;
    if (cap !== null && placed >= cap) { picks.set(g.id, undefined); continue; }
    const pick = bestFit(g, live, estimator);
    if (pick && seen.has(pick.id)) { picks.set(g.id, undefined); continue; }
    picks.set(g.id, pick);
    if (pick) { seen.add(pick.id); placed++; }
  }
  return { picks, optional: config.quests.optional };
}
