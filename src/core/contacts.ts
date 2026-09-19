/**
 * Who to write to, and how a finished draft leaves the app.
 *
 * Pure: no network, no framework. The addresses themselves are **synthetic**
 * and stay synthetic. Canvas does not publish instructor emails in the `.ics`
 * feed -- the feed carries no ORGANIZER, no ATTENDEE and nothing email-shaped
 * at all -- so real addresses would need the Canvas REST API and a personal
 * access token, and many Canvas instances hide instructor email from students
 * by permission anyway. See docs/future-signals.md.
 *
 * That constraint is also a safety rail worth keeping during a hackathon: a
 * demo that can reach a real professor is one misclick from emailing a real
 * professor.
 */

export interface Contact {
  /** Course code as the estimator keys it, e.g. "MGT 808". */
  courseCode: string;
  courseName?: string;
  name: string;
  email: string;
  /** How the student should open the message. "Professor Ruiz" beats "Hi". */
  salutation: string;
  /** True when this is a placeholder rather than something the student confirmed. */
  synthetic: boolean;
}

/**
 * A stand-in roster. Deliberately obvious: every address is @example.edu, a
 * reserved domain that cannot deliver, so an accidental send goes nowhere.
 */
export const SAMPLE_ROSTER: Contact[] = [
  { courseCode: "MGT 808", courseName: "Fundamentals of Consulting", name: "Dr. Alice Ruiz", email: "a.ruiz@example.edu", salutation: "Professor Ruiz", synthetic: true },
  { courseCode: "FE 570", courseName: "Market Microstructure and Trading Strategies", name: "Dr. Daniel Osei", email: "d.osei@example.edu", salutation: "Professor Osei", synthetic: true },
  { courseCode: "FE 621", courseName: "Computational Methods in Finance", name: "Dr. Mei Lin", email: "m.lin@example.edu", salutation: "Professor Lin", synthetic: true },
  { courseCode: "MATH 0220", courseName: "Analytic Geometry and Calculus 1", name: "Dr. Harold Vance", email: "h.vance@example.edu", salutation: "Professor Vance", synthetic: true },
  { courseCode: "CS 0441", courseName: "Discrete Structures for Computer Science", name: "Dr. Priya Raman", email: "p.raman@example.edu", salutation: "Professor Raman", synthetic: true },
  { courseCode: "ENGCMP 0200", courseName: "Seminar in Composition", name: "Dr. Tomas Beck", email: "t.beck@example.edu", salutation: "Professor Beck", synthetic: true },
];

/**
 * The student's own corrections win over the sample.
 *
 * This is how a real address gets in without one ever being committed: the
 * roster ships synthetic, and anything the student types in the draft window
 * is layered on top at runtime, in memory. Nothing here is persisted to disk.
 */
export function mergeRoster(base: Contact[], overrides?: Contact[] | null): Contact[] {
  const out = base.map((c) => ({ ...c }));
  // Tolerate a missing list: the store is an in-memory object that survives
  // hot reloads, so a field added after it was created is simply absent until
  // the server restarts. A new field must never 500 the route that reads it.
  for (const o of overrides ?? []) {
    const i = out.findIndex((c) => normaliseCode(c.courseCode) === normaliseCode(o.courseCode));
    if (i >= 0) out[i] = { ...out[i], ...o, synthetic: false };
    else out.push({ ...o, synthetic: false });
  }
  return out;
}

/** Case- and spacing-insensitive lookup: "mgt808" and "MGT 808" are the same course. */
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function findContact(roster: Contact[], courseCode?: string): Contact | undefined {
  if (!courseCode) return undefined;
  const want = normaliseCode(courseCode);
  return roster.find((c) => normaliseCode(c.courseCode) === want);
}

/**
 * Resolve a course from whatever the student said out loud. They will say
 * "consulting" or "my consulting class", not "MGT 808".
 */
export function resolveCourse(roster: Contact[], spoken: string): Contact[] {
  const s = spoken.toLowerCase().trim();
  if (!s) return [];
  const exact = findContact(roster, s);
  if (exact) return [exact];
  const words = s.split(/\s+/).filter((w) => w.length > 3 && !/^(class|course|professor|prof|my|the|for)$/.test(w));
  const hits = roster.filter((c) => {
    const hay = `${c.courseCode} ${c.courseName ?? ""} ${c.name}`.toLowerCase();
    return normaliseCode(s).length > 2 && normaliseCode(hay).includes(normaliseCode(s))
      ? true
      : words.some((w) => hay.includes(w));
  });
  return hits;
}

// MARK: - Handing the finished draft to the student's own mail client

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

/**
 * A `mailto:` URL, which is how a draft leaves Orbit today.
 *
 * This is not a fallback for "we could not get Microsoft Graph working". It is
 * the right first version: Orbit holds no mailbox credential, cannot send
 * anything on its own, and the student sees the finished message in their own
 * Outlook, from their own address, and presses send themselves. The approval
 * step is the mail client, which is a step nobody can accidentally skip.
 *
 * Encoding note: encodeURIComponent leaves !'()* alone and encodes a space as
 * %20, both of which mail clients accept. Newlines must be %0D%0A -- a bare
 * %0A silently collapses the paragraphs in some Outlook builds.
 */
export function mailtoUrl(d: Draft): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%0A/g, "%0D%0A");
  return `mailto:${encodeURIComponent(d.to)}?subject=${enc(d.subject)}&body=${enc(d.body)}`;
}

/**
 * Open the message in Outlook on the web, already filled in, in the tab the
 * student is already looking at. `outlook.office.com` is the school/Microsoft
 * 365 host; `outlook.live.com` is the personal one.
 *
 * This is as close to "send from Outlook" as anything can get without holding
 * a mailbox credential: it is genuinely Outlook, genuinely their account, and
 * genuinely their address in the From line. They press Send there.
 */
export function outlookWebUrl(d: Draft, host: "school" | "personal" = "school"): string {
  const base = host === "school" ? "https://outlook.office.com/mail/deeplink/compose" : "https://outlook.live.com/mail/0/deeplink/compose";
  const q = new URLSearchParams({ to: d.to, subject: d.subject, body: d.body });
  return `${base}?${q.toString()}`;
}
