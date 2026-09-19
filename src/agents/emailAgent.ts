import Anthropic from "@anthropic-ai/sdk";
import { claude } from "./models";
import type { Contact, Draft } from "@/core/contacts";
import { classify, draftDeterministic, validateDraft, type DraftRequest, type Intent } from "@/core/emailDraft";

/**
 * The Email Agent.
 *
 * A separate agent with exactly one job: turning something a student said out
 * loud into a formal message to an instructor. It is deliberately not part of
 * the Day Agent, because it is the only agent whose output is read by another
 * human being, and that deserves its own prompt, its own validation and its
 * own blast radius.
 *
 * Three things make it safe:
 *
 *  1. **It cannot send.** It returns a draft. Sending is a Tier B proposal
 *     that a person approves, and even then Orbit holds no mailbox credential
 *     -- approval opens the student's own mail client with the message
 *     pre-filled, and they press send. See docs/email.md.
 *  2. **It cannot choose the recipient.** The address comes from the roster,
 *     server-side. The model is told who it is writing to and the result is
 *     rejected if it changes that.
 *  3. **It cannot invent a reason.** The intent is classified in code before
 *     the model runs, the facts are passed in, and `validateDraft` rejects
 *     invented medical detail or promises made on the student's behalf. If it
 *     fails, the deterministic letter is used instead and the reason is shown.
 *
 * With no ANTHROPIC_API_KEY the deterministic drafter writes the whole letter,
 * and it is a real letter, not a placeholder.
 */

export interface EmailResult extends Draft {
  intent: Intent;
  contact: Contact;
  provider: "claude" | "deterministic";
  /** Why the model's version was discarded, when it was. */
  rejected?: string[];
  latencyMs: number;
}

const SYSTEM = [
  "You write a short, formal email from a university student to their instructor. Reply with JSON only: {\"subject\": string, \"body\": string}.",
  "Register: polite, plain, direct. No flattery, no apologising twice, no 'I hope this email finds you well'. British or American spelling is fine, be consistent.",
  "Length: under 120 words. One ask per email. End with a thank you and the student's name if given.",
  "You are given the student's own words and a small set of facts. Use only those.",
  "Never invent a reason, a medical detail, a diagnosis, a document you will provide, or a promise. If the student said they are unwell, the email says they are unwell and nothing more specific.",
  "Never change who the email is addressed to.",
  "Do not claim the student has already done something unless the facts say so.",
].join(" ");

export async function draftEmail(said: string, contact: Contact, facts: DraftRequest["facts"] = {}): Promise<EmailResult> {
  const started = Date.now();
  // Classified in code, before any model runs: what kind of letter this is is
  // not something a language model gets to decide.
  const intent = classify(said);
  const req: DraftRequest = { said, contact, intent, facts };
  const fallback = draftDeterministic(req);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...fallback, intent, contact, provider: "deterministic", latencyMs: Date.now() - started };
  }

  try {
    const msg = await claude().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 700,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Instructor: ${contact.name}, addressed as "${contact.salutation}".`,
            `Course: ${contact.courseCode}${contact.courseName ? ` (${contact.courseName})` : ""}.`,
            `Kind of email: ${intent}.`,
            facts.studentName ? `Student's name: ${facts.studentName}.` : "",
            facts.when ? `Session affected: ${facts.when}.` : "",
            facts.task ? `Assignment or topic: ${facts.task}.` : "",
            facts.newDate ? `Date being requested: ${facts.newDate}.` : "",
            facts.evidence ? `True scheduling fact you may cite: ${facts.evidence}.` : "",
            "",
            `The student said, in their own words: "${said}"`,
            "",
            "Write the email.",
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Partial<Draft>;
    const problems = validateDraft(parsed, req);

    if (problems.length) {
      return { ...fallback, intent, contact, provider: "deterministic", rejected: problems, latencyMs: Date.now() - started };
    }
    // The recipient is ours, never the model's, even when it agreed with us.
    return {
      to: contact.email,
      subject: parsed.subject!.trim(),
      body: parsed.body!.trim(),
      intent,
      contact,
      provider: "claude",
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ...fallback,
      intent,
      contact,
      provider: "deterministic",
      rejected: [(e as Error).message.slice(0, 120)],
      latencyMs: Date.now() - started,
    };
  }
}

export type { Anthropic };
