/**
 * Minutes from midnight. Values past 1440 mean "after midnight but still the
 * same subjective day", so a 00:30 bedtime is 1470 and ordering stays sane.
 */
export type Minutes = number;

export function t(hours: number, minutes = 0): Minutes {
  return hours * 60 + minutes;
}

export function fmt(m: Minutes): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function fromDate(d: Date, tz?: string): Minutes {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: tz,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function dayKey(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(d);
}
