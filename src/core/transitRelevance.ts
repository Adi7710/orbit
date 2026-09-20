import type { FixedBlock, PlaceId } from "./types";

/**
 * Whether a bus is worth working out at all, and which one.
 *
 * Until now Orbit planned a journey on every single load of Today. That meant
 * three protobuf feeds fetched and a route solved for a student sitting on
 * their sofa at four in the afternoon with nothing until Thursday. It is
 * wasted work against a public agency's servers, it is latency on the one
 * screen that has to be instant, and it puts a bus on screen at a moment when
 * a bus is not the answer to anything.
 *
 * So transit became demand-driven. It runs when there is a reason:
 *
 *  - **A class to get to.** Inside the lead time, which is the walk plus the
 *    ride plus a margin, not a fixed number -- somebody in Squirrel Hill needs
 *    to know earlier than somebody already in Oakland.
 *  - **The way home** once the last class of the day has finished.
 *  - **Because you asked.** An explicit destination always wins; if the
 *    student picked a place, they want the answer whatever the clock says.
 *
 * Everything else returns `false` and no feed is touched.
 */

export type TransitReason = "class" | "home" | "asked" | "idle";

export interface TransitNeed {
  needed: boolean;
  reason: TransitReason;
  /** Where they are going, when we know. */
  to?: PlaceId;
  /** The block being caught, so the caller can pass its start as arriveBy. */
  block?: FixedBlock;
  /** Plain sentence for the UI and the voice, so nobody invents one. */
  why: string;
}

/** Default door-to-door allowance when we have nothing measured: walk + ride + slack. */
export const DEFAULT_LEAD_MINUTES = 75;
/** After the last class, keep offering the way home for this long. */
export const HOME_TAIL_MINUTES = 120;

export function transitNeed(opts: {
  nowMin: number;
  blocks: FixedBlock[];
  /** A place the student explicitly picked. Always wins. */
  askedFor?: PlaceId;
  /** Minutes of warning needed for the next class; defaults to DEFAULT_LEAD_MINUTES. */
  leadMinutes?: number;
  /** Crisis and chill do not change whether a bus exists, only what we plan into gaps. */
  isPlace?: (p: string | undefined) => boolean;
}): TransitNeed {
  const isPlace = opts.isPlace ?? ((p) => !!p);
  const lead = opts.leadMinutes ?? DEFAULT_LEAD_MINUTES;
  const ordered = [...opts.blocks].sort((a, b) => a.start - b.start);

  if (opts.askedFor) {
    return { needed: true, reason: "asked", to: opts.askedFor, why: `You asked about getting to ${opts.askedFor}.` };
  }

  const nextClass = ordered.find((b) => b.start > opts.nowMin && isPlace(b.place));
  if (nextClass) {
    const until = nextClass.start - opts.nowMin;
    if (until <= lead) {
      return { needed: true, reason: "class", to: nextClass.place, block: nextClass, why: `${nextClass.title} starts in ${until} minutes.` };
    }
    // Deliberately not "no bus": there is one, it is just not yet the thing
    // worth spending a network call and a card on.
    return { needed: false, reason: "idle", to: nextClass.place, block: nextClass, why: `Nothing to catch yet. ${nextClass.title} is ${until} minutes away.` };
  }

  const lastClass = [...ordered].reverse().find((b) => isPlace(b.place));
  if (lastClass && lastClass.end <= opts.nowMin && opts.nowMin - lastClass.end <= HOME_TAIL_MINUTES) {
    return { needed: true, reason: "home", to: undefined, block: lastClass, why: "Your last class is done, so this is the way home." };
  }

  return { needed: false, reason: "idle", why: "Nothing on campus to get to, so no bus to work out." };
}
