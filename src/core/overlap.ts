import type { Gap } from "./gaps";

export interface FriendGaps { userId: string; name: string; gaps: Gap[]; sharesFreeTime: boolean }

export interface Overlap { start: number; end: number; minutes: number; userIds: string[]; place?: string }

/**
 * The social graph Orbit gets for free: everyone's timetable implies
 * everyone's gaps. Find windows where you and friends are free at the same
 * time (>= minMinutes), respecting each friend's opt-in. Never exposes a
 * friend's classes, only the shared free window.
 */
export function sharedGaps(mine: Gap[], friends: FriendGaps[], minMinutes = 30): Overlap[] {
  const out: Overlap[] = [];
  for (const g of mine) {
    const present = friends.filter((f) => f.sharesFreeTime);
    // Start with my gap and intersect with each friend that overlaps it.
    const candidates = present
      .map((f) => ({ f, ov: f.gaps.map((fg) => ({ start: Math.max(g.start, fg.start), end: Math.min(g.end, fg.end) })).filter((o) => o.end - o.start >= minMinutes) }))
      .filter((x) => x.ov.length);
    for (const { f, ov } of candidates) {
      for (const o of ov) {
        const existing = out.find((e) => e.start === o.start && e.end === o.end);
        if (existing) existing.userIds.push(f.userId);
        else out.push({ start: o.start, end: o.end, minutes: o.end - o.start, userIds: [f.userId], place: g.fromPlace });
      }
    }
  }
  return out.sort((a, b) => b.userIds.length - a.userIds.length || b.minutes - a.minutes);
}
