import { blocks as fixtureBlocks, profile as fixtureProfile, tasks as fixtureTasks, travel as fixtureTravel } from "@/core/__tests__/fixture";
import type { FixedBlock, Mode, Task, DayProfile } from "@/core/types";
import type { TravelGraph } from "@/core/travel";
import type { Proposal } from "@/agents/dayAgent";
import type { LeaderRow } from "@/core/game";
import type { FriendGaps } from "@/core/overlap";
import { Estimator } from "@/core/estimator";
import { t } from "@/core/time";

/**
 * In-memory store for the hackathon. Swap for Postgres (drizzle) by keeping
 * the same shape. Everything below is synthetic: no real student data.
 */
export interface Event { seq: number; ts: string; actor: "rules" | "agent" | "user" | "voice"; type: string; payload: unknown }

export interface StoredProposal { id: string; proposal: Proposal; status: "pending" | "approved" | "declined"; createdAt: string; resolvedAt?: string }

interface Store {
  user: { id: string; name: string; group: string; streakWeeks: number; xpWeek: number; ringsClosed: number };
  profile: DayProfile;
  travel: TravelGraph;
  blocks: FixedBlock[];
  tasks: Task[];
  mode: Mode;
  estimator: Estimator;
  proposals: StoredProposal[];
  events: Event[];
  friends: FriendGaps[];
  board: LeaderRow[];
  instructors: Record<string, string>;
}

const g = globalThis as unknown as { __orbit?: Store };

function seed(): Store {
  const estimator = new Estimator();
  // Six prior sessions for MATH 0220 so the multiplier is already live (hand-checked ~1.6x).
  for (const a of [95, 100, 90, 105, 98, 92]) estimator.record("MATH 0220", "build", 60, a);
  return {
    user: { id: "me", name: "You", group: "Tower A", streakWeeks: 2, xpWeek: 340, ringsClosed: 4 },
    profile: fixtureProfile,
    travel: fixtureTravel,
    blocks: [...fixtureBlocks],
    tasks: fixtureTasks.map((x) => ({ ...x })),
    mode: "normal",
    estimator,
    proposals: [],
    events: [],
    friends: [
      { userId: "sam", name: "Sam", sharesFreeTime: true, gaps: [{ id: "s1", start: t(11, 30), end: t(13, 0), usable: 90, isEvening: false }] },
      { userId: "priya", name: "Priya", sharesFreeTime: true, gaps: [{ id: "p1", start: t(12, 0), end: t(14, 0), usable: 120, isEvening: false }, { id: "p2", start: t(19, 0), end: t(22, 0), usable: 180, isEvening: true }] },
      { userId: "jordan", name: "Jordan", sharesFreeTime: false, gaps: [{ id: "j1", start: t(11, 0), end: t(14, 0), usable: 180, isEvening: false }] },
    ],
    board: [
      { userId: "me", name: "You", xpWeek: 340, streakWeeks: 2, ringsClosed: 4, group: "Tower A" },
      { userId: "sam", name: "Sam", xpWeek: 410, streakWeeks: 3, ringsClosed: 5, group: "Tower A" },
      { userId: "priya", name: "Priya", xpWeek: 385, streakWeeks: 1, ringsClosed: 6, group: "Tower A" },
      { userId: "jordan", name: "Jordan", xpWeek: 120, streakWeeks: 0, ringsClosed: 1, group: "Tower B" },
      { userId: "lee", name: "Lee", xpWeek: 520, streakWeeks: 5, ringsClosed: 7, group: "Tower B" },
    ],
    instructors: { "MATH 0220": "prof.lee@pitt.edu", "CS 0441": "prof.chen@pitt.edu", "ENGCMP 0200": "prof.ortiz@pitt.edu" },
  };
}

export function store(): Store {
  if (!g.__orbit) g.__orbit = seed();
  return g.__orbit;
}

export function reset() {
  g.__orbit = seed();
}

export function log(actor: Event["actor"], type: string, payload: unknown) {
  const s = store();
  s.events.push({ seq: s.events.length + 1, ts: new Date().toISOString(), actor, type, payload });
}
