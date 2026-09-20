import { blocks as fixtureBlocks, profile as fixtureProfile, tasks as fixtureTasks, travel as fixtureTravel } from "@/core/__tests__/fixture";
import type { FixedBlock, Mode, Task, DayProfile } from "@/core/types";
import type { TravelGraph } from "@/core/travel";
import type { Proposal } from "@/agents/dayAgent";
import type { LeaderRow } from "@/core/game";
import type { FriendGaps } from "@/core/overlap";
import { Estimator } from "@/core/estimator";
import { t } from "@/core/time";
import type { HabitRecord } from "@/core/habits";
import { syntheticHistory } from "@/core/habitSeed";
import { SAMPLE_ROSTER, type Contact } from "@/core/contacts";
import { clock } from "@/services/prt";

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
  /** Instructor addresses the student corrected at runtime. Never persisted; the shipped roster stays synthetic. */
  contacts: Contact[];
  /** Rolling history of self-eval runs, so the score is a trend and not one reading. */
  selfEval: { at: string; asked: number; passed: number; score: number; avgCritic: number | null }[];
  /** Completed sessions the Patterns card learns from. Seeded with synthetic history; real completions append. */
  habits: HabitRecord[];
}

const g = globalThis as unknown as { __orbit?: Store };

/** How far the planning clock is from the wall clock; zero unless DEMO_CLOCK is set. */
const clockShiftMs = () => clock().epoch * 1000 - Date.now();

/** The "build" course with seeded history, per region. Same six sessions either way. */
const SEED_COURSE = (process.env.ORBIT_REGION ?? "hudson") === "oakland" ? "MATH 0220" : "FE 621";

function seed(): Store {
  const estimator = new Estimator();
  // Six prior sessions so the multiplier is already live (hand-checked ~1.6x).
  // The course follows the region: the seeded history has to belong to a class
  // the student is actually shown, or the calibration card names a course from
  // another university on an otherwise coherent screen.
  for (const a of [95, 100, 90, 105, 98, 92]) estimator.record(SEED_COURSE, "build", 60, a);
  return {
    user: { id: "me", name: process.env.ORBIT_USER_NAME ?? "Adi", group: "Tower A", streakWeeks: 2, xpWeek: 340, ringsClosed: 4 },
    profile: fixtureProfile,
    travel: fixtureTravel,
    blocks: [...fixtureBlocks],
    // Seed deadlines are offsets from now, and under DEMO_CLOCK "now" is the
    // pinned weekday: a task due in twenty-six hours must not read as overdue
    // the moment the clock is pinned two days ahead for judging.
    tasks: fixtureTasks.map((x) => ({ ...x, dueAt: x.dueAt ? new Date(x.dueAt.getTime() + clockShiftMs()) : undefined })),
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
      { userId: "me", name: process.env.ORBIT_USER_NAME ?? "Adi", xpWeek: 340, streakWeeks: 2, ringsClosed: 4, group: "Tower A" },
      { userId: "sam", name: "Sam", xpWeek: 410, streakWeeks: 3, ringsClosed: 5, group: "Tower A" },
      { userId: "priya", name: "Priya", xpWeek: 385, streakWeeks: 1, ringsClosed: 6, group: "Tower A" },
      { userId: "jordan", name: "Jordan", xpWeek: 120, streakWeeks: 0, ringsClosed: 1, group: "Tower B" },
      { userId: "lee", name: "Lee", xpWeek: 520, streakWeeks: 5, ringsClosed: 7, group: "Tower B" },
    ],
    habits: syntheticHistory(new Date()),
    // Derived from the synthetic roster, so every shipped address is on
    // example.edu -- reserved, and incapable of delivering. The old literal
    // was three invented names on @pitt.edu, a real domain, which is exactly
    // the kind of address the email rules exist to keep out of the repo.
    instructors: Object.fromEntries(SAMPLE_ROSTER.map((c) => [c.courseCode, c.email])),
    contacts: [],
    selfEval: [],
  };
}

/** Field names a seeded store has. Computed once, not per call. */
const SEED_KEYS: string[] = Object.keys(seed() as unknown as Record<string, unknown>);

export function store(): Store {
  if (!g.__orbit) g.__orbit = seed();
  // Backfill anything added to Store since this object was created.
  //
  // The store is a module-level object that deliberately survives hot reload,
  // so adding a field to the *type* does not add it to the object already in
  // memory. Every route reading the new field then throws until someone
  // restarts -- and a restart wipes an imported calendar, which is exactly the
  // moment you least want to be forced into one. Adding a field must never be
  // able to break a running server.
  const s = g.__orbit as unknown as Record<string, unknown>;
  // Cheap check on the hot path: seed() rebuilds fixtures and a synthetic
  // history, so only pay for it when a key is genuinely absent.
  if (SEED_KEYS.some((k) => s[k] === undefined)) {
    const fresh = seed() as unknown as Record<string, unknown>;
    for (const k of SEED_KEYS) if (s[k] === undefined) s[k] = fresh[k];
  }
  return g.__orbit;
}

export function reset() {
  g.__orbit = seed();
}

export function log(actor: Event["actor"], type: string, payload: unknown) {
  const s = store();
  s.events.push({ seq: s.events.length + 1, ts: new Date().toISOString(), actor, type, payload });
}
