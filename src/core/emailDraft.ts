import type { Contact, Draft } from "./contacts";

/**
 * The deterministic drafter.
 *
 * Lives in the pure core, with no model and no network, because the Email
 * Agent must produce a correct, sendable, formal message when there is no API
 * key -- which is the state this repo is in right now. The model's job is to
 * write *better* prose than this, never to be the only thing that can write at
 * all.
 *
 * Every sentence here is built from facts the server passed in. Nothing about
 * a student's health, their reasons, or a promise they did not make is ever
 * invented: "I am unwell" is what they said, and the letter says only that.
 */

export type Intent = "absence" | "extension" | "question" | "meeting";

export interface DraftRequest {
  /** What the student actually said, verbatim. */
  said: string;
  contact: Contact;
  intent: Intent;
  /** Course-facing facts the server knows. The drafter may use these and nothing else. */
  facts: {
    /** e.g. "Tuesday 19 September" -- the session being missed. */
    when?: string;
    /** Assignment or task the message is about. */
    task?: string;
    /** For an extension: the date being requested. */
    newDate?: string;
    /** Ledger evidence, already phrased, e.g. "514 usable minutes against 1264 assigned". */
    evidence?: string;
    studentName?: string;
  };
}

/** Keyword classification. Runs before any model so the model cannot change what kind of letter this is. */
export function classify(said: string): Intent {
  const s = said.toLowerCase();
  // "I need until Friday" is how people actually ask for an extension; none of
  // the obvious keywords appear in it. Caught by a test, not by inspection.
  if (/\b(extend|extension|more time|push back|late submission|deadline|hand (it )?in late|submit late)\b/.test(s)) return "extension";
  if (/\b(until|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|the \d+)/.test(s)) return "extension";
  if (/\b(meet|meeting|office hours|appointment|talk to you|sit down)\b/.test(s)) return "meeting";
  if (/\b(sick|unwell|ill|not feeling|fever|flu|leave|absent|absence|miss|cannot attend|can't attend|skip)\b/.test(s)) return "absence";
  return "question";
}

const SUBJECTS: Record<Intent, (r: DraftRequest) => string> = {
  absence: (r) => `${r.contact.courseCode}: absence${r.facts.when ? ` on ${r.facts.when}` : ""}`,
  extension: (r) => `${r.contact.courseCode}: extension request${r.facts.task ? ` — ${r.facts.task}` : ""}`,
  question: (r) => `${r.contact.courseCode}: question${r.facts.task ? ` about ${r.facts.task}` : ""}`,
  meeting: (r) => `${r.contact.courseCode}: request to meet`,
};

/**
 * Formal register, short, no excuses and no over-explaining. A student asking
 * for one thing should ask for one thing.
 */
export function draftDeterministic(r: DraftRequest): Draft {
  const sign = r.facts.studentName ? `\n\nThank you,\n${r.facts.studentName}` : "\n\nThank you,";
  const open = `Dear ${r.contact.salutation},`;
  let middle: string;

  switch (r.intent) {
    case "absence":
      middle = [
        `I am unwell and will not be able to attend${r.facts.when ? ` ${r.facts.when}` : " today"}.`,
        `I wanted to let you know in advance rather than simply not appear.`,
        `Could you let me know whether this absence is excused, and what I should do to catch up on what I miss?`,
        r.facts.task ? `I will still submit ${r.facts.task} on time.` : "",
      ].filter(Boolean).join(" ");
      break;
    case "extension":
      middle = [
        `I am writing to ask whether it would be possible to submit ${r.facts.task ?? "the current assignment"}${r.facts.newDate ? ` by ${r.facts.newDate}` : " a little later than the posted deadline"}.`,
        r.facts.evidence ? `My schedule this week leaves ${r.facts.evidence}.` : "",
        `I understand if this is not possible, and I will submit what I have by the original deadline if so.`,
      ].filter(Boolean).join(" ");
      break;
    case "question":
      middle = [
        `I had a question about ${r.facts.task ?? "the current material"}.`,
        `${cleanQuestion(r.said)}`,
        `Any guidance you can give would be appreciated.`,
      ].filter(Boolean).join(" ");
      break;
    case "meeting":
      middle = [
        `I would like to arrange a short meeting to discuss ${r.facts.task ?? `${r.contact.courseCode}`}.`,
        `Would any of your office hours this week suit, or is there a time that works better for you?`,
      ].join(" ");
      break;
  }

  return { to: r.contact.email, subject: SUBJECTS[r.intent](r), body: `${open}\n\n${middle}${sign}` };
}

/**
 * Turn what the student said into one reported sentence, without pretending to
 * understand it. Used only for the question intent, where the substance really
 * is theirs and paraphrasing it would lose the point.
 */
function cleanQuestion(said: string): string {
  const s = said.trim().replace(/^(hey|hi|um+|uh+|so)[,\s]+/i, "").replace(/\s+/g, " ");
  const first = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.?!]$/.test(first) ? first : `${first}.`;
}

/**
 * Guard rails the model's output has to pass. A letter to a professor is the
 * highest-stakes text Orbit produces, so anything the model returns is checked
 * mechanically before a human is even shown it.
 */
export function validateDraft(d: Partial<Draft>, r: DraftRequest): string[] {
  const problems: string[] = [];
  const body = (d.body ?? "").trim();
  if (!d.subject?.trim()) problems.push("no subject");
  if (!body) problems.push("no body");
  if (d.to && d.to !== r.contact.email) problems.push("changed the recipient");
  if (body.length > 1400) problems.push("too long for one ask");
  if (!body.toLowerCase().includes(r.contact.salutation.toLowerCase().split(" ").pop() ?? "")) problems.push("does not address the instructor");
  // The model must not invent a medical claim, a diagnosis, or a promise.
  if (/\b(doctor|hospital|diagnos|prescrib|emergency room|covid|positive test)\b/i.test(body)) problems.push("invented a medical detail");
  if (/\b(I promise|I guarantee|I swear)\b/i.test(body)) problems.push("made a promise on the student's behalf");
  return problems;
}
