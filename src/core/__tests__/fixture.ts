import { t } from "../time";
import { defaultProfile, type FixedBlock, type Task } from "../types";
import { TravelGraph } from "../travel";

/**
 * A real Pitt Tuesday, computed by hand before the code was written.
 * Home on Bouquet St. Walking. Wake 08:00, bed 00:30.
 *
 * awake 990 - class 175 - travel 46 - meals 115 - routines 65 = usable 589.
 * Gaps: 11:05-14:21 (196) and 15:50-23:44 (474). Two other holes are
 * correctly discarded (morning 16 min after the walk; 3 min between classes).
 */
export const profile = defaultProfile("Home");

export const oaklandTravel = (() => {
  const g = new TravelGraph("walk");
  g.setDefault("Home", "Sennott", 14);
  g.setDefault("Sennott", "Benedum", 7);
  g.setDefault("Benedum", "Cathedral", 9);
  g.setDefault("Cathedral", "Home", 16);
  return g;
})();

/**
 * Jersey City to Stevens. Door-to-door minutes from buildJourney() on the
 * Hudson slice -- nine minutes to Marin Boulevard, the light rail to Hoboken
 * Terminal, eighteen up to Babbio -- not a guess. The graph is undirected and
 * the two directions differ by two minutes (44 out, 42 home, different stop
 * choice), so the larger one is kept: when Orbit is wrong about a commute it
 * should be wrong by counting too much of it.
 *
 * This was the last Pittsburgh number on the Hudson screen. With the Oakland
 * graph the ledger charged 20 minutes of travel for a day whose own bus card
 * said 44 each way, and "Orbit counts the walk" is the headline.
 */
export const hudsonTravel = (() => {
  // Fallback of 8: an unknown pair is two campus buildings, a short walk.
  const g = new TravelGraph("bus", 8);
  g.setDefault("Home", "Babbio", 44);
  g.setDefault("Home", "HobokenTerminal", 26);
  g.setDefault("Home", "Gateway", 49);
  g.setDefault("Home", "Burchard", 50);
  g.setDefault("Home", "Howe", 49);
  g.setDefault("Babbio", "HobokenTerminal", 18);
  // Babbio is on the waterfront; the rest are up on Castle Point.
  g.setDefault("Babbio", "Gateway", 7);
  g.setDefault("Babbio", "Burchard", 8);
  g.setDefault("Babbio", "Howe", 7);
  g.setDefault("Gateway", "Burchard", 3);
  g.setDefault("Gateway", "Howe", 2);
  g.setDefault("Burchard", "Howe", 3);
  return g;
})();

export const travel = (process.env.ORBIT_REGION ?? "hudson") === "oakland" ? oaklandTravel : hudsonTravel;

/**
 * Pitt, Oakland. Pinned by the ledger and gap tests, so it stays exactly as it
 * is; ORBIT_REGION=oakland runs against it.
 */
export const oaklandBlocks: FixedBlock[] = [
  { id: "cs0441", title: "CS 0441 Discrete Structures", start: t(9, 5), end: t(9, 55), place: "Sennott", kind: "class", courseCode: "CS 0441" },
  { id: "math0220", title: "MATH 0220 Calculus 1", start: t(10, 10), end: t(11, 0), place: "Benedum", kind: "class", courseCode: "MATH 0220" },
  { id: "engcmp", title: "ENGCMP 0200 Seminar", start: t(14, 30), end: t(15, 45), place: "Cathedral", kind: "class", courseCode: "ENGCMP 0200" },
];

/**
 * Stevens, Hoboken. The three courses on the real Canvas feed, all School of
 * Business and so all in Babbio, down on the waterfront -- which is a
 * different walk from Hoboken Terminal than the buildings up on Castle Point.
 * Times mirror the Oakland day so the ledger reads the same either way.
 */
export const hudsonBlocks: FixedBlock[] = [
  { id: "fe570", title: "FE 570 Market Microstructure", start: t(9, 5), end: t(9, 55), place: "Babbio", kind: "class", courseCode: "FE 570" },
  { id: "fe621", title: "FE 621 Computational Methods", start: t(10, 10), end: t(11, 0), place: "Babbio", kind: "class", courseCode: "FE 621" },
  { id: "mgt808", title: "MGT 808 Fundamentals of Consulting", start: t(14, 30), end: t(15, 45), place: "Babbio", kind: "class", courseCode: "MGT 808" },
];

export const blocks: FixedBlock[] = (process.env.ORBIT_REGION ?? "hudson") === "oakland" ? oaklandBlocks : hudsonBlocks;

export const oaklandTasks: Task[] = [
  { id: "ps4", title: "Problem Set 4", domain: "build", estimateMinutes: 90, courseCode: "MATH 0220", source: "canvas", dueAt: new Date(Date.now() + 26 * 36e5) },
  { id: "read", title: "Reading: Chapter 3", domain: "learn", estimateMinutes: 40, courseCode: "CS 0441", source: "manual" },
  { id: "gym", title: "Gym", domain: "body", estimateMinutes: 60, source: "manual" },
  { id: "essay", title: "Essay draft", domain: "build", estimateMinutes: 180, courseCode: "ENGCMP 0200", source: "canvas", dueAt: new Date(Date.now() + 5 * 864e5) },
];

// Same ids, same domains, same minutes, same due offsets -- only the courses
// change. The ids are load-bearing (voice maps "the problem set" to `ps4`),
// and keeping every number identical means the ledger, the gaps and the
// hand-computed tests come out the same in both cities. When the app moved
// to Stevens the blocks moved and the tasks did not, so the Today screen
// showed a Hoboken commute feeding a University of Pittsburgh course list.
export const hudsonTasks: Task[] = [
  { id: "ps4", title: "Problem Set 4", domain: "build", estimateMinutes: 90, courseCode: "FE 621", source: "canvas", dueAt: new Date(Date.now() + 26 * 36e5) },
  { id: "read", title: "Reading: Chapter 3", domain: "learn", estimateMinutes: 40, courseCode: "FE 570", source: "manual" },
  { id: "gym", title: "Gym", domain: "body", estimateMinutes: 60, source: "manual" },
  { id: "essay", title: "Case write-up draft", domain: "build", estimateMinutes: 180, courseCode: "MGT 808", source: "canvas", dueAt: new Date(Date.now() + 5 * 864e5) },
];

export const tasks: Task[] = (process.env.ORBIT_REGION ?? "hudson") === "oakland" ? oaklandTasks : hudsonTasks;
