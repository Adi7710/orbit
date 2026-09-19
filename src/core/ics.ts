import type { FixedBlock, Task } from "./types";
import { fromDate } from "./time";
import { heuristicMinutes } from "./estimator";

export interface Recurrence {
  freq: "DAILY" | "WEEKLY";
  interval: number;
  weekdays: number[]; // 0 = Sunday
  until?: Date;
  count?: number;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  location?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  recurrence?: Recurrence;
  excluded: Date[];
}

const WD: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out.filter(Boolean);
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\t/g, "\t").replace(/\\(.)/g, "$1");
}

function parseProp(line: string): { name: string; params: Record<string, string>; value: string } | undefined {
  const colon = line.indexOf(":");
  if (colon < 0) return undefined;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...ps] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const [k, v] = p.split("=");
    if (k && v) params[k.toUpperCase()] = v;
  }
  return { name: name.toUpperCase(), params, value: unescape(value) };
}

export function parseIcsDate(raw: string, params: Record<string, string> = {}): Date | undefined {
  const s = raw.trim();
  if (s.length < 8) return undefined;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  if (s.length >= 15 && s[8] === "T") {
    const h = +s.slice(9, 11), mi = +s.slice(11, 13), se = +s.slice(13, 15);
    if (s.endsWith("Z")) return new Date(Date.UTC(y, mo - 1, d, h, mi, se));
    if (params.TZID) {
      // Wall time in TZID: take the UTC guess, measure the zone's offset at
      // that instant, and shift by it.
      const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
      return new Date(guess.getTime() - tzOffsetMinutes(guess, params.TZID) * 60000);
    }
    return new Date(y, mo - 1, d, h, mi, se);
  }
  return new Date(y, mo - 1, d);
}

/** Offset of `tz` from UTC at `date`, in minutes (New York in September = -240). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function parseRecurrence(value: string): Recurrence | undefined {
  const parts: Record<string, string> = {};
  for (const piece of value.split(";")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ?.toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY") return undefined;
  const weekdays = (parts.BYDAY ?? "").split(",").map((t) => WD[t.slice(-2).toUpperCase()]).filter((n) => n !== undefined);
  return {
    freq,
    interval: Math.max(1, +(parts.INTERVAL ?? 1)),
    weekdays,
    until: parts.UNTIL ? parseIcsDate(parts.UNTIL) : undefined,
    count: parts.COUNT ? +parts.COUNT : undefined,
  };
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let fields: Record<string, ReturnType<typeof parseProp>> = {};
  let exdates: { value: string; params: Record<string, string> }[] = [];
  let inside = false;
  for (const line of unfold(text)) {
    if (line.startsWith("BEGIN:VEVENT")) { inside = true; fields = {}; exdates = []; continue; }
    if (line.startsWith("END:VEVENT")) {
      const ds = fields.DTSTART;
      const start = ds && parseIcsDate(ds.value, ds.params);
      if (inside && ds && start) {
        const allDay = ds.params.VALUE?.toUpperCase() === "DATE" || ds.value.length === 8;
        events.push({
          uid: fields.UID?.value ?? crypto.randomUUID(),
          summary: fields.SUMMARY?.value ?? "Untitled",
          location: fields.LOCATION?.value || undefined,
          start,
          end: fields.DTEND ? parseIcsDate(fields.DTEND.value, fields.DTEND.params) : undefined,
          allDay,
          recurrence: fields.RRULE ? parseRecurrence(fields.RRULE.value) : undefined,
          excluded: exdates.flatMap((e) => e.value.split(",").map((v) => parseIcsDate(v, e.params))).filter((d): d is Date => !!d),
        });
      }
      inside = false;
      continue;
    }
    if (!inside) continue;
    const p = parseProp(line);
    if (!p) continue;
    if (p.name === "EXDATE") exdates.push({ value: p.value, params: p.params });
    else fields[p.name] = p;
  }
  return events;
}

/** Calendar date of `d` in `tz` (or the server's local zone when tz is omitted) as whole days since the epoch. */
function dayNumber(d: Date, tz?: string): number {
  if (!tz) return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 864e5;
}
const weekdayOf = (dayNum: number) => new Date(dayNum * 864e5).getUTCDay();

/**
 * Does the event fall on `day`? Dates are compared as calendar days in `tz`.
 * Without tz the server's local zone is used, which is wrong on a UTC host
 * (a 20:00 New York class is already tomorrow in UTC), so callers that know the
 * student's zone should pass it.
 */
export function occursOn(ev: IcsEvent, day: Date, tz?: string): boolean {
  const target = dayNumber(day, tz);
  const first = dayNumber(ev.start, tz);
  if (ev.excluded.some((x) => dayNumber(x, tz) === target)) return false;
  if (!ev.recurrence) return first === target;
  const r = ev.recurrence;
  if (target < first) return false;
  if (r.until && target > dayNumber(r.until, tz)) return false;
  const days = target - first;
  if (r.freq === "DAILY") {
    if (days % r.interval !== 0) return false;
    return r.count ? days / r.interval < r.count : true;
  }
  const allowed = r.weekdays.length ? r.weekdays : [weekdayOf(first)];
  if (!allowed.includes(weekdayOf(target))) return false;
  const weeks = Math.floor(days / 7);
  if (weeks % r.interval !== 0) return false;
  return r.count ? (weeks / r.interval) * allowed.length < r.count : true;
}

/** "CMPSC 0441 - Discrete Structures" or "Problem Set 4 [MATH 0220]" -> course code. */
/** The `[Course Name]` suffix Canvas appends to every event in a feed. */
export function bracketName(summary: string): string | undefined {
  const m = summary.match(/\[([^\]]+)\]\s*$/);
  return m ? m[1].trim() : undefined;
}

/**
 * "2026F MGT 808-WS Tuesday Class" -> "MGT 808". Looks anywhere in the string,
 * so it also finds the code Canvas tucks inside parentheses part-way through a
 * title, and steps over the term prefix because "2026F" is not two letters.
 */
export function codeFromText(text: string): string | undefined {
  // Three or four digits: Stevens writes FE 570, Pitt writes CS 0441. Pinning
  // this at three silently dropped every Pitt code, which is the campus the
  // rest of the app is built around.
  const m = text.match(/\b([A-Z]{2,6})\s*(\d{3,4})\b/);
  return m ? `${m[1]} ${m[2]}` : undefined;
}

/**
 * A class meeting, not a piece of work: "2026F FE 570-A", "2025S MGT 808-WS1
 * FUNDAMENTALS OF CONSULTING". Canvas publishes these into the same feed as
 * assignments, and importing them as tasks invents hours of coursework that
 * nobody has to do -- and then feeds that fiction into the habit history.
 */
export function isClassMeeting(summary: string): boolean {
  return /^\s*\d{4}[A-Z]\s+[A-Z]{2,6}\s*\d{3,4}\b/.test(summary.replace(/\s*\[[^\]]+\]\s*$/, ""));
}

/**
 * Learns "Fundamentals of Consulting" -> "MGT 808" from the events that happen
 * to carry both, then lets every other event in that course borrow it.
 *
 * Canvas puts the course *code* only on class meetings and the odd title, and
 * the course *name* on everything. Without this the estimator keys 37 tasks
 * under "Fundamentals of Consulting" and 13 under "MGT 808" as if they were
 * different courses, so neither bucket ever reaches the five samples it needs
 * and the agent can never say "your MGT 808 estimates are 1.6x what you guess".
 */
export function resolveCourseCodes(summaries: string[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const s of summaries) {
    const name = bracketName(s);
    const code = codeFromText(s);
    if (!name || !code) continue;
    const m = votes.get(name) ?? new Map<string, number>();
    m.set(code, (m.get(code) ?? 0) + 1);
    votes.set(name, m);
  }
  const out = new Map<string, string>();
  for (const [name, m] of votes) {
    // A course can be renumbered between terms; take the code seen most often.
    out.set(name, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return out;
}

export function courseCode(summary: string, codes?: Map<string, string>): string | undefined {
  // A code written in the title always wins: it is the most specific thing there.
  const inTitle = codeFromText(summary.replace(/\s*\[[^\]]+\]\s*$/, ""));
  if (inTitle) return inTitle;
  const name = bracketName(summary);
  if (name) return codes?.get(name) ?? name;
  const parts = summary.split(/\s+/);
  if (parts.length >= 2 && /^[A-Z]{2,}$/.test(parts[0]) && /^\d+[A-Z]?$/.test(parts[1].replace(/[,:-]+$/, ""))) {
    return `${parts[0]} ${parts[1].replace(/[,:-]+$/, "")}`;
  }
  return undefined;
}

export function cleanTitle(summary: string): string {
  return summary.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

/** "Benedum Hall 1045" -> "Benedum". Grouping by building is what the travel graph needs. */
export function placeFromLocation(location?: string): string | undefined {
  if (!location) return undefined;
  const first = location.split(/[,\n]/)[0].trim().split(/\s+/)[0]?.replace(/[^\w]/g, "");
  return first || undefined;
}

export function blocksOn(day: Date, events: IcsEvent[], tz?: string): FixedBlock[] {
  return events
    .filter((e) => !e.allDay && e.end && occursOn(e, day, tz))
    .map((e) => ({
      id: `${e.uid}@${day.toDateString()}`,
      title: cleanTitle(e.summary),
      start: fromDate(e.start, tz),
      end: fromDate(e.end!, tz),
      place: placeFromLocation(e.location),
      kind: "class" as const,
      courseCode: courseCode(e.summary),
    }))
    .sort((a, b) => a.start - b.start);
}

/** Canvas assignments become tasks carrying their real due time. Date-only events are due at 23:59 in `tz` (server-local when omitted). */
export function taskFromEvent(e: IcsEvent, tz?: string, codes?: Map<string, string>): Task {
  let due = e.start;
  if (e.allDay) {
    const wall = new Date(Date.UTC(e.start.getFullYear(), e.start.getMonth(), e.start.getDate(), 23, 59));
    due = tz ? new Date(wall.getTime() - tzOffsetMinutes(wall, tz) * 60000) : new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate(), 23, 59);
  }
  const title = cleanTitle(e.summary);
  return {
    id: e.uid,
    title,
    domain: "build",
    estimateMinutes: heuristicMinutes(title),
    dueAt: due,
    courseCode: courseCode(e.summary, codes),
    source: "canvas",
    evidence: { kind: "ics", uid: e.uid },
  };
}
