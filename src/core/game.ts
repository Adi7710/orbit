import type { Domain, Mode, Task } from "./types";
import { MODE_RULES } from "./types";
import type { Gap } from "./gaps";

/**
 * Gamification that cannot be farmed. XP comes only from completing a task
 * inside a gap Orbit planned, scaled by how honest the estimate was. Creating
 * tasks, checking boxes at midnight, or spamming tiny tasks earns nothing
 * extra; XP is capped per day and per task.
 */
export const XP = {
  perPlannedMinute: 1,
  onTimeBonus: 25,
  inGapBonus: 15,
  ringCloseBonus: 40,
  streakMultiplierPerWeek: 0.1,
  dailyCap: 400,
  perTaskCap: 150,
} as const;

export interface Completion {
  task: Task;
  actualMinutes: number;
  plannedMinutes: number;
  completedInGap?: Gap;
  completedAt: Date;
}

export function xpFor(c: Completion, mode: Mode, streakWeeks: number): { xp: number; reasons: string[] } {
  if (!MODE_RULES[mode].awardsXP) return { xp: 0, reasons: [`${mode} mode: no XP, no streak damage`] };
  const reasons: string[] = [];
  let xp = Math.min(c.plannedMinutes, c.actualMinutes) * XP.perPlannedMinute;
  reasons.push(`${Math.min(c.plannedMinutes, c.actualMinutes)} focused minutes`);
  if (c.completedInGap) { xp += XP.inGapBonus; reasons.push("done inside a planned gap"); }
  if (c.task.dueAt && c.completedAt <= c.task.dueAt) { xp += XP.onTimeBonus; reasons.push("on time"); }
  const honesty = c.plannedMinutes > 0 ? Math.min(c.actualMinutes, c.plannedMinutes) / Math.max(c.actualMinutes, c.plannedMinutes) : 1;
  xp = Math.round(xp * (0.5 + 0.5 * honesty));
  if (honesty < 0.6) reasons.push("estimate was far off, XP scaled down");
  xp = Math.round(xp * (1 + XP.streakMultiplierPerWeek * Math.min(streakWeeks, 5)));
  if (streakWeeks > 0) reasons.push(`${streakWeeks}-week streak`);
  return { xp: Math.min(xp, XP.perTaskCap), reasons };
}

export interface RingTarget { domain: Domain; currentMinutes: number; destinationMinutes: number }

/** Ratchet up by at most 10%, never past destination, never downward. */
export function ratchet(t: RingTarget, observedMedian: number): RingTarget {
  const candidate = Math.round(observedMedian * 1.1);
  return { ...t, currentMinutes: Math.min(t.destinationMinutes, Math.max(t.currentMinutes, candidate)) };
}

export function ringProgress(domainMinutes: number, target: RingTarget, mode: Mode): number {
  const goal = target.currentMinutes * MODE_RULES[mode].targetMultiplier(target.domain);
  if (goal <= 0) return 1;
  return Math.min(1, domainMinutes / goal);
}

export interface LeaderRow { userId: string; name: string; xpWeek: number; streakWeeks: number; ringsClosed: number; group?: string }

/** Weekly board. Rank by XP, tiebreak by rings closed then streak. Groups (dorm, major, friends) filter, never change the math. */
export function rankBoard(rows: LeaderRow[], group?: string): (LeaderRow & { rank: number })[] {
  return rows
    .filter((r) => !group || r.group === group)
    .sort((a, b) => b.xpWeek - a.xpWeek || b.ringsClosed - a.ringsClosed || b.streakWeeks - a.streakWeeks)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface Quest { id: string; title: string; xp: number; gapId?: string; kind: "task" | "bus" | "social" | "body"; expiresAt: number }

/** Quests are generated from real gaps and real buses, so they cannot be completed by lying. */
export function questsForDay(gaps: Gap[], picks: Map<string, Task | undefined>, busLeaveBy?: { gapId: string; leaveBy: number; route: string }): Quest[] {
  const quests: Quest[] = [];
  for (const g of gaps) {
    const t = picks.get(g.id);
    if (t) quests.push({ id: `q-${g.id}`, title: `Finish "${t.title}" in your ${g.usable}-minute gap`, xp: Math.min(XP.perTaskCap, t.estimateMinutes), gapId: g.id, kind: "task", expiresAt: g.end });
  }
  if (busLeaveBy) quests.push({ id: `q-bus-${busLeaveBy.gapId}`, title: `Catch the ${busLeaveBy.route}: leave by ${busLeaveBy.leaveBy}`, xp: 20, gapId: busLeaveBy.gapId, kind: "bus", expiresAt: busLeaveBy.leaveBy });
  return quests;
}
