/**
 * Saying times and durations the way a person says them.
 *
 * Orbit composes every sentence containing a number, which is what stops a
 * model inventing one. The cost, until now, was that it sounded like a
 * stopwatch: "you have four hours forty-four clear from seven o'clock". Nobody
 * who knew your schedule would say that. They would say you have the evening,
 * that you are winding down around midnight, and that they would start with
 * the case study.
 *
 * So the numbers stay exact where being wrong costs you something, and go soft
 * where precision is just noise:
 *
 *  - **Soft**: how long you have, how long a task takes, when you wind down.
 *    "About two and a half hours" is what a person says and is not less true.
 *  - **Exact, always**: when to leave for a bus, when a class starts, minutes
 *    you actually logged. Round a leave-by time and someone misses a bus.
 */

const ONES = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];

/** 144 -> "about two and a half hours". 40 -> "about forty minutes". */
export function naturalDuration(minutes: number): string {
  if (minutes < 20) return `about ${Math.max(5, Math.round(minutes / 5) * 5)} minutes`;
  if (minutes < 40) return "about half an hour";
  if (minutes < 53) return "about three quarters of an hour";

  const quarters = Math.round(minutes / 15);
  const h = Math.floor(quarters / 4);
  const rem = quarters % 4;
  const hw = h === 1 ? "an hour" : `${ONES[h % 12] ?? h} hours`;

  if (rem === 0) return `about ${hw}`;
  if (rem === 2) return h === 1 ? "about an hour and a half" : `about ${ONES[h % 12] ?? h} and a half hours`;
  if (rem === 1) return `just over ${hw}`;
  return `nearly ${h + 1 === 1 ? "an hour" : `${ONES[(h + 1) % 12] ?? h + 1} hours`}`;
}

/** 1424 -> "about quarter to midnight". Soft: for winding down, not for buses. */
export function naturalClock(minutesFromMidnight: number): string {
  const m = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const name = (h: number) => {
    const x = ((h % 24) + 24) % 24;
    if (x === 0) return "midnight";
    if (x === 12) return "noon";
    return ONES[x % 12];
  };
  const near = Math.round(mm / 15) * 15;
  if (near === 0) return name(h24);
  if (near === 15) return `quarter past ${name(h24)}`;
  if (near === 30) return `half past ${name(h24)}`;
  if (near === 45) return `quarter to ${name(h24 + 1)}`;
  return name(h24 + 1); // 60
}

/**
 * "the evening", "the afternoon" -- the shape of what is left, not its length.
 *
 * `afterGreeting` avoids "Evening, Adi. You have the evening", which is how
 * this reads when the greeting word and the part of day are the same.
 */
export function partOfDay(minutesFromMidnight: number, afterGreeting = false): string {
  const h = Math.floor((((minutesFromMidnight % 1440) + 1440) % 1440) / 60);
  if (h < 12) return afterGreeting ? "the rest of the morning" : "the morning";
  if (h < 17) return afterGreeting ? "the rest of the afternoon" : "the afternoon";
  if (h < 22) return afterGreeting ? "the rest of tonight" : "the evening";
  return "what is left of tonight";
}

/** "Morning" / "Afternoon" / "Evening", for a greeting. */
export function greetingWord(minutesFromMidnight: number): string {
  const h = Math.floor((((minutesFromMidnight % 1440) + 1440) % 1440) / 60);
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

/** "three things", "one thing" -- counted the way it is spoken. */
export function countThings(n: number, singular = "thing", plural = "things"): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const w = n < words.length ? words[n] : String(n);
  return `${w} ${n === 1 ? singular : plural}`;
}

/** "due Monday", "due tomorrow", "due today" -- relative, the way a person says it. */
export function naturalDue(due: Date | string | undefined, now = new Date()): string | undefined {
  if (!due) return undefined;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 864e5);
  if (diff < 0) return "already overdue";
  if (diff === 0) return "due tonight";
  if (diff === 1) return "due tomorrow";
  if (diff < 7) return `due ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `due ${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}
