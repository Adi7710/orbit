import type { HabitRecord } from "./habits";
import { tzOffsetMinutes } from "./ics";
import { mulberry32 } from "./prng";

/**
 * Three weeks of made-up history so the Patterns card has something to say on
 * day one. Everything here is synthetic and flagged `synthetic: true`. The
 * patterns are planted on purpose so the pattern math can be tested against a
 * known answer:
 *
 *  - reading: 0.8x the estimate before noon, 1.3x in the evening
 *  - graded work: 1.2x before noon, 1.5x in the afternoon, 1.9x in the evening
 *  - graded work is finished a few hours before it is due
 *  - the gym happens on weekend evenings at about the estimate
 */
const TZ = "America/New_York";

/** The instant at which a wall clock in the student's zone reads `minutes` on the given calendar day. */
export function wall(y: number, m: number, d: number, minutes: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, TZ) * 60000);
}

// Fixture Tuesday gaps: 11:05-14:21 and 15:50-23:44.
const inFixtureGap = (start: number, end: number) => (start >= 665 && end <= 861) || (start >= 950 && end <= 1424);
const at = (h: number, m = 0) => h * 60 + m;

interface Slot { title: string; domain: HabitRecord["domain"]; course?: string; planned: number; start: number; ratio: number; dueAfterH?: [number, number] }

const WEEK: Record<number, Slot[]> = {
  1: [{ title: "Reading", domain: "learn", course: "CS 0441", planned: 40, start: at(11, 10), ratio: 0.8 }, { title: "Problem Set", domain: "build", course: "MATH 0220", planned: 90, start: at(12, 30), ratio: 1.5, dueAfterH: [2, 8] }],
  2: [{ title: "Reading", domain: "learn", course: "CS 0441", planned: 40, start: at(19), ratio: 1.3 }, { title: "Problem Set", domain: "build", course: "MATH 0220", planned: 90, start: at(20), ratio: 1.9, dueAfterH: [2, 8] }],
  3: [{ title: "Reading", domain: "learn", course: "CS 0441", planned: 40, start: at(11, 10), ratio: 0.8 }, { title: "Problem Set", domain: "build", course: "MATH 0220", planned: 90, start: at(11, 50), ratio: 1.2, dueAfterH: [2, 8] }],
  4: [{ title: "Reading", domain: "learn", course: "CS 0441", planned: 40, start: at(19), ratio: 1.3 }, { title: "Problem Set", domain: "build", course: "MATH 0220", planned: 90, start: at(16), ratio: 1.5, dueAfterH: [2, 8] }],
  5: [{ title: "Reading", domain: "learn", course: "CS 0441", planned: 40, start: at(11, 10), ratio: 0.8 }],
  6: [{ title: "Gym", domain: "body", planned: 60, start: at(17, 30), ratio: 1 }],
  0: [{ title: "Gym", domain: "body", planned: 60, start: at(17, 30), ratio: 1 }],
};

/** `anchor` is the day after the last seeded day; `days` counts back from it. */
export function syntheticHistory(anchor: Date, days = 21): HabitRecord[] {
  const rand = mulberry32(20260919);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(anchor).split("-").map(Number);
  const out: HabitRecord[] = [];
  let n = 0;
  for (let back = days; back >= 1; back--) {
    const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - back));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    for (const slot of WEEK[day.getUTCDay()] ?? []) {
      const jitter = 1 + (rand() - 0.5) * 0.1; // +-5%
      const actual = Math.max(5, Math.round(slot.planned * slot.ratio * jitter));
      const completedAt = wall(y, m, d, slot.start + actual);
      const dueAt = slot.dueAfterH ? new Date(completedAt.getTime() + (slot.dueAfterH[0] + rand() * (slot.dueAfterH[1] - slot.dueAfterH[0])) * 36e5) : undefined;
      out.push({
        taskId: `seed-${++n}`,
        title: `${slot.title} ${Math.ceil(n / 3)}`,
        domain: slot.domain,
        courseCode: slot.course,
        plannedMinutes: slot.planned,
        actualMinutes: actual,
        completedAt,
        inGap: inFixtureGap(slot.start, slot.start + actual),
        dueAt,
        synthetic: true,
      });
    }
  }
  return out;
}
