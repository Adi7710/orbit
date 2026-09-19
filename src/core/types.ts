import type { Minutes } from "./time";

export type PlaceId = string;

export type Domain = "learn" | "build" | "body" | "life";

export type Mode = "normal" | "crisis" | "chill";

export interface FixedBlock {
  id: string;
  title: string;
  start: Minutes;
  end: Minutes;
  place?: PlaceId;
  kind: "class" | "work" | "event" | "routine";
  courseCode?: string;
}

export interface Task {
  id: string;
  title: string;
  domain: Domain;
  estimateMinutes: number;
  dueAt?: Date;
  courseCode?: string;
  source: "manual" | "canvas" | "syllabus";
  isPriority?: boolean;
  completedAt?: Date;
  /** Provenance: where this task came from (syllabus page + box, or ICS uid). */
  evidence?: { kind: "syllabus"; page: number; bbox: [number, number, number, number]; text: string } | { kind: "ics"; uid: string };
}

export interface DayProfile {
  home: PlaceId;
  wake: Minutes;
  sleepStart: Minutes; // may exceed 1440
  morningRoutineMinutes: number;
  windDownMinutes: number;
  mealMinutes: number;
  priorityDomains: Domain[];
}

export const defaultProfile = (home: PlaceId = "home"): DayProfile => ({
  home,
  wake: 8 * 60,
  sleepStart: 24 * 60 + 30,
  morningRoutineMinutes: 35,
  windDownMinutes: 30,
  mealMinutes: 115,
  priorityDomains: [],
});

export const MODE_RULES: Record<
  Mode,
  { targetMultiplier: (d: Domain) => number; priorityLimit: number; awardsXP: boolean; horizonHours?: number }
> = {
  normal: { targetMultiplier: () => 1, priorityLimit: 3, awardsXP: true },
  crisis: { targetMultiplier: (d) => (d === "learn" || d === "build" ? 1 : 0), priorityLimit: 1, awardsXP: false },
  chill: { targetMultiplier: () => 0.4, priorityLimit: 1, awardsXP: false, horizonHours: 48 },
};
