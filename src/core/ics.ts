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
  let exdates: string[] = [];
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
          excluded: exdates.flatMap((e) => e.split(",")).map((e) => parseIcsDate(e)).filter((d): d is Date => !!d),
        });
      }
      inside = false;
      continue;
    }
    if (!inside) continue;
    const p = parseProp(line);
    if (!p) continue;
    if (p.name === "EXDATE") exdates.push(p.value);
    else fields[p.name] = p;
  }
  return events;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function occursOn(ev: IcsEvent, day: Date): boolean {
  if (ev.excluded.some((x) => sameDay(x, day))) return false;
  if (!ev.recurrence) return sameDay(ev.start, day);
  const r = ev.recurrence;
  const target = startOfDay(day), first = startOfDay(ev.start);
  if (target < first) return false;
  if (r.until && target > startOfDay(r.until)) return false;
  const days = Math.round((target.getTime() - first.getTime()) / 864e5);
  if (r.freq === "DAILY") {
    if (days % r.interval !== 0) return false;
    return r.count ? days / r.interval < r.count : true;
  }
  const allowed = r.weekdays.length ? r.weekdays : [first.getDay()];
  if (!allowed.includes(target.getDay())) return false;
  const weeks = Math.floor(days / 7);
  if (weeks % r.interval !== 0) return false;
  return r.count ? (weeks / r.interval) * allowed.length < r.count : true;
}

/** "CMPSC 0441 - Discrete Structures" or "Problem Set 4 [MATH 0220]" -> course code. */
export function courseCode(summary: string): string | undefined {
  const m = summary.match(/\[([^\]]+)\]\s*$/);
  if (m) return m[1].trim();
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
    .filter((e) => !e.allDay && e.end && occursOn(e, day))
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

/** Canvas assignments become tasks carrying their real due time. Date-only events are due at 23:59. */
export function taskFromEvent(e: IcsEvent): Task {
  const due = e.allDay ? new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate(), 23, 59) : e.start;
  const title = cleanTitle(e.summary);
  return {
    id: e.uid,
    title,
    domain: "build",
    estimateMinutes: heuristicMinutes(title),
    dueAt: due,
    courseCode: courseCode(e.summary),
    source: "canvas",
    evidence: { kind: "ics", uid: e.uid },
  };
}
