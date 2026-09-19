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

export const travel = (() => {
  const g = new TravelGraph("walk");
  g.setDefault("Home", "Sennott", 14);
  g.setDefault("Sennott", "Benedum", 7);
  g.setDefault("Benedum", "Cathedral", 9);
  g.setDefault("Cathedral", "Home", 16);
  return g;
})();

export const blocks: FixedBlock[] = [
  { id: "cs0441", title: "CS 0441 Discrete Structures", start: t(9, 5), end: t(9, 55), place: "Sennott", kind: "class", courseCode: "CS 0441" },
  { id: "math0220", title: "MATH 0220 Calculus 1", start: t(10, 10), end: t(11, 0), place: "Benedum", kind: "class", courseCode: "MATH 0220" },
  { id: "engcmp", title: "ENGCMP 0200 Seminar", start: t(14, 30), end: t(15, 45), place: "Cathedral", kind: "class", courseCode: "ENGCMP 0200" },
];

export const tasks: Task[] = [
  { id: "ps4", title: "Problem Set 4", domain: "build", estimateMinutes: 90, courseCode: "MATH 0220", source: "canvas", dueAt: new Date(Date.now() + 26 * 36e5) },
  { id: "read", title: "Reading: Chapter 3", domain: "learn", estimateMinutes: 40, courseCode: "CS 0441", source: "manual" },
  { id: "gym", title: "Gym", domain: "body", estimateMinutes: 60, source: "manual" },
  { id: "essay", title: "Essay draft", domain: "build", estimateMinutes: 180, courseCode: "ENGCMP 0200", source: "canvas", dueAt: new Date(Date.now() + 5 * 864e5) },
];
