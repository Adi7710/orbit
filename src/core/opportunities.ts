import type { Domain } from "./types";

/**
 * The world outside the timetable: hackathons, competitions and calls the
 * student could actually enter, matched to what Orbit has learned about
 * them. Hardcoded for the demo and flagged so, because a live feed of
 * hackathon listings is a scraper and a rate limit, not a feature, and the
 * judging table needs the list to be there.
 *
 * Every recommendation is a sentence written here by code from three
 * server-owned things: the learned multipliers (is this student faster in
 * the morning, do they finish build work), the queue (how loaded the week
 * is), and the calendar (how many days until it starts). Nothing here is
 * guessed by a model; the model's job in this file is nil.
 */
export interface Opportunity {
  id: string;
  name: string;
  kind: "hackathon" | "competition" | "call";
  /** ISO date of the first day. */
  starts: string;
  /** Days long. */
  days: number;
  where: string;
  domain: Domain;
  /** Rough hours a serious attempt takes. */
  hours: number;
  url: string;
  /** One line about why it exists. */
  tagline: string;
  synthetic: true;
}

export const OPPORTUNITIES: Opportunity[] = [
  { id: "hacknjit-2026", name: "HackNJIT", kind: "hackathon", starts: "2026-11-07", days: 2, where: "Newark, NJ (a PATH ride away)", domain: "build", hours: 24, url: "https://hacknjit.org", tagline: "The big one in the neighbourhood.", synthetic: true },
  { id: "hackprinceton-2026", name: "HackPrinceton", kind: "hackathon", starts: "2026-11-14", days: 2, where: "Princeton, NJ", domain: "build", hours: 30, url: "https://hackprinceton.com", tagline: "Hardware track, serious sponsors.", synthetic: true },
  { id: "stevens-quackathon-2026", name: "Stevens Quackathon", kind: "hackathon", starts: "2026-10-17", days: 1, where: "Stevens, Hoboken", domain: "build", hours: 12, url: "https://stevens.edu", tagline: "On campus, twelve hours, no excuse.", synthetic: true },
  { id: "cfa-research-2026", name: "CFA Institute Research Challenge", kind: "competition", starts: "2026-10-30", days: 60, where: "Remote, then New York final", domain: "learn", hours: 40, url: "https://www.cfainstitute.org", tagline: "Equity research, team of five, judged by analysts.", synthetic: true },
  { id: "rotman-trading-2027", name: "Rotman International Trading Competition", kind: "competition", starts: "2027-02-18", days: 3, where: "Toronto", domain: "learn", hours: 25, url: "https://ritc.rotman.utoronto.ca", tagline: "Simulated markets; FE 570 in the wild.", synthetic: true },
  { id: "nvidia-dev-contest-2026", name: "NVIDIA Developer Contest", kind: "call", starts: "2026-10-01", days: 45, where: "Online", domain: "build", hours: 20, url: "https://developer.nvidia.com", tagline: "Ship something on Nemotron; you already have.", synthetic: true },
  { id: "elevenlabs-worldwide-2026", name: "ElevenLabs Worldwide Hackathon", kind: "hackathon", starts: "2026-11-21", days: 2, where: "Online and NYC site", domain: "build", hours: 20, url: "https://elevenlabs.io", tagline: "Voice-first; Orbit is a head start.", synthetic: true },
  { id: "mgt808-case-2026", name: "Consulting Case Competition (MGT 808)", kind: "competition", starts: "2026-12-04", days: 1, where: "Babbio, Stevens", domain: "learn", hours: 15, url: "https://stevens.edu", tagline: "The course itself, with a prize.", synthetic: true },
];

export interface OpportunityRec {
  opportunity: Opportunity;
  /** Days from now until it starts; negative means under way. */
  inDays: number;
  /** 0..1, higher is a better fit for this student right now. */
  fit: number;
  /** One sentence, written by code, that says why. */
  reason: string;
}

export interface OpportunityContext {
  now: Date;
  /** Learned multipliers by domain, 1 when unknown. >1 means this student runs long on it. */
  domainMultiplier?: Partial<Record<Domain, number>>;
  /** How many minutes of queued work sit against the usable minutes this week. */
  queuedMinutes: number;
  usableMinutes: number;
  /** Which domain the student has finished the most of, if known. */
  strongestDomain?: Domain;
  /** Morning or evening person, from the time-of-day aspect. */
  bestTime?: "morning" | "evening";
  /** How far ahead to look. */
  horizonDays?: number;
}

const DAY = 864e5;

function daysUntil(iso: string, now: Date): number {
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
}

/**
 * Rank what is coming up for this student. Fit is three things: does it
 * start in a window they can prepare for, is the week light enough to take
 * it on, and does it play to a domain they finish. The reason names the
 * strongest of those in plain words, with the number that decided it.
 */
export function recommendOpportunities(ctx: OpportunityContext, list: Opportunity[] = OPPORTUNITIES): OpportunityRec[] {
  const horizon = ctx.horizonDays ?? 120;
  const load = ctx.usableMinutes > 0 ? ctx.queuedMinutes / ctx.usableMinutes : 1;
  const out: OpportunityRec[] = [];

  for (const o of list) {
    const inDays = daysUntil(o.starts, ctx.now);
    if (inDays < -o.days || inDays > horizon) continue;

    // Lead time: sweet spot is two to eight weeks out.
    const lead = inDays < 0 ? 0.6 : inDays < 14 ? 0.5 : inDays <= 56 ? 1 : 0.7;
    // Load: a heavy week argues for the short ones.
    const room = load < 0.5 ? 1 : load < 0.85 ? 0.85 : o.hours <= 15 ? 0.7 : 0.4;
    // Fit: a domain this student finishes, and does not run long on.
    const m = ctx.domainMultiplier?.[o.domain] ?? 1;
    const strong = ctx.strongestDomain === o.domain ? 1 : 0.8;
    const pace = m <= 1.1 ? 1 : m <= 1.4 ? 0.85 : 0.7;
    const fit = Math.round(lead * room * strong * pace * 100) / 100;

    const when = inDays < 0 ? "is under way" : inDays === 0 ? "starts today" : inDays === 1 ? "starts tomorrow" : inDays < 14 ? `starts in ${inDays} days` : `starts in ${Math.round(inDays / 7)} weeks`;
    let why: string;
    if (load >= 0.85 && o.hours <= 15) why = `it is ${o.hours} hours and your week is already full, so a short one is the one to pick`;
    else if (m > 1.4) why = `your ${o.domain} work runs about ${Math.round((m - 1) * 100)}% longer than you plan, so budget ${Math.round(o.hours * m)} hours, not ${o.hours}`;
    else if (ctx.strongestDomain === o.domain) why = `${o.domain} is the work you actually finish`;
    else if (ctx.bestTime === "morning" && o.days <= 2) why = `you are faster before noon, and a weekend event is two mornings`;
    else why = o.tagline;

    out.push({ opportunity: o, inDays, fit, reason: `${o.name} ${when}, ${o.where}. ${why.charAt(0).toUpperCase()}${why.slice(1)}.` });
  }

  return out.sort((a, b) => b.fit - a.fit || a.inDays - b.inDays);
}

/**
 * Growth, as a plan and not a pep talk: three lines from what was learned,
 * each with the number behind it, and the one opportunity to aim at. Spoken
 * by the coach and shown on the page. No feelings the app decided on.
 */
export function growthPlan(ctx: OpportunityContext, facts: { aspect: string; sentence: string }[], recs = recommendOpportunities(ctx)): string[] {
  const lines: string[] = [];
  const m = ctx.domainMultiplier ?? {};
  const long = (Object.entries(m) as [Domain, number][]).filter(([, v]) => v > 1.2).sort((a, b) => b[1] - a[1])[0];
  if (long) lines.push(`Plan ${Math.round((long[1] - 1) * 100)}% more time for ${long[0]} work than your first guess; that is what your history says it takes.`);
  if (ctx.bestTime) lines.push(ctx.bestTime === "morning" ? "Put the hardest thing before noon. That is when you are fastest." : "Your evenings are your strong hours. Keep them for the hard thing.");
  const loadPct = ctx.usableMinutes > 0 ? Math.round((ctx.queuedMinutes / ctx.usableMinutes) * 100) : 100;
  lines.push(loadPct > 85 ? `This week is ${loadPct}% booked. Finish before you add.` : `This week is ${loadPct}% booked. There is room for one more thing.`);
  const top = recs[0];
  if (top) lines.push(`Aim at ${top.opportunity.name}: ${top.reason.split(". ").slice(1).join(". ")}`);
  for (const f of facts.slice(0, 1)) if (!lines.some((l) => l.includes(f.sentence))) lines.push(f.sentence);
  return lines.slice(0, 4);
}
