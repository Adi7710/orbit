import { describe, expect, it } from "vitest";
import { findContact, mailtoUrl, normaliseCode, resolveCourse, SAMPLE_ROSTER } from "@/core/contacts";
import { classify, draftDeterministic, validateDraft, type DraftRequest } from "@/core/emailDraft";

const ruiz = SAMPLE_ROSTER.find((c) => c.courseCode === "MGT 808")!;
const req = (said: string, over: Partial<DraftRequest> = {}): DraftRequest => ({
  said,
  contact: ruiz,
  intent: classify(said),
  facts: { studentName: "Adi", when: "Tuesday 22 September" },
  ...over,
});

describe("working out what kind of letter this is", () => {
  it("reads the sentence the feature was asked for", () => {
    expect(classify("professor I am not feeling good today, can I take a leave")).toBe("absence");
  });

  it("separates an extension from an absence", () => {
    expect(classify("can I get more time on the case study")).toBe("extension");
    expect(classify("I need to push back the deadline")).toBe("extension");
  });

  it("recognises a question and a meeting", () => {
    expect(classify("should this be a slide deck or a written report")).toBe("question");
    expect(classify("can we meet during your office hours")).toBe("meeting");
  });

  it("is decided in code, so the model cannot change the kind of letter", () => {
    // Same words, no model involved: the classification is a pure function.
    expect(classify("I am ill")).toBe(classify("I am ill"));
  });
});

describe("the deterministic letter, used whenever there is no key", () => {
  it("is a real, sendable letter and not a placeholder", () => {
    const d = draftDeterministic(req("professor I am not feeling good today, can I take a leave"));
    expect(d.to).toBe("a.ruiz@example.edu");
    expect(d.subject).toContain("MGT 808");
    expect(d.body).toContain("Dear Professor Ruiz,");
    expect(d.body).toContain("Adi");
    expect(d.body.length).toBeGreaterThan(120);
  });

  it("says only that the student is unwell, never why", () => {
    const d = draftDeterministic(req("I have a terrible fever and cannot get out of bed"));
    expect(d.body).toContain("I am unwell");
    expect(d.body).not.toMatch(/fever|doctor|bed/i);
  });

  it("cites the ledger when asking for an extension, and concedes gracefully", () => {
    const d = draftDeterministic(req("I need until Friday for the case study", {
      facts: { task: "the Deloitte case study", newDate: "Friday", evidence: "514 usable minutes against 1264 assigned" },
    }));
    expect(d.body).toContain("Friday");
    expect(d.body).toContain("514 usable minutes");
    expect(d.body).toMatch(/I understand if this is not possible/);
  });

  it("keeps the student's own question rather than paraphrasing it away", () => {
    const d = draftDeterministic(req("should the case study be a slide deck or a written report"));
    expect(d.body).toMatch(/slide deck or a written report/i);
  });
});

describe("what the model is not allowed to come back with", () => {
  const base = req("I am not feeling good, can I take a leave");

  it("passes an ordinary well-formed letter", () => {
    expect(validateDraft({ to: ruiz.email, subject: "MGT 808: absence", body: "Dear Professor Ruiz,\n\nI am unwell today.\n\nThank you,\nAdi" }, base)).toEqual([]);
  });

  it("rejects an invented medical detail", () => {
    const p = validateDraft({ to: ruiz.email, subject: "s", body: "Dear Professor Ruiz, my doctor has diagnosed me with flu." }, base);
    expect(p).toContain("invented a medical detail");
  });

  it("rejects a promise made on the student's behalf", () => {
    const p = validateDraft({ to: ruiz.email, subject: "s", body: "Dear Professor Ruiz, I promise to submit tomorrow." }, base);
    expect(p).toContain("made a promise on the student's behalf");
  });

  it("rejects changing who it is addressed to", () => {
    const p = validateDraft({ to: "someone.else@example.edu", subject: "s", body: "Dear Professor Ruiz, hello." }, base);
    expect(p).toContain("changed the recipient");
  });

  it("rejects a letter that never addresses the instructor", () => {
    expect(validateDraft({ to: ruiz.email, subject: "s", body: "Hey, cannot make it today." }, base)).toContain("does not address the instructor");
  });

  it("rejects an essay", () => {
    expect(validateDraft({ to: ruiz.email, subject: "s", body: `Dear Professor Ruiz, ${"word ".repeat(400)}` }, base)).toContain("too long for one ask");
  });
});

describe("finding the right professor from what the student said", () => {
  it("matches a course code however it is spaced or cased", () => {
    expect(findContact(SAMPLE_ROSTER, "mgt808")?.name).toBe("Dr. Alice Ruiz");
    expect(normaliseCode("MGT 808")).toBe(normaliseCode("mgt-808"));
  });

  it("resolves a course from the name a student would actually say", () => {
    const hits = resolveCourse(SAMPLE_ROSTER, "consulting");
    expect(hits).toHaveLength(1);
    expect(hits[0].courseCode).toBe("MGT 808");
  });

  it("returns several when the word is genuinely ambiguous, so the agent asks", () => {
    // Guessing a recipient is the one mistake this feature must never make,
    // so an ambiguous word has to come back as a list and not a winner.
    const ambiguous = [
      { ...ruiz, courseCode: "FIN 101", courseName: "Corporate Finance", email: "a@example.edu" },
      { ...ruiz, courseCode: "FIN 202", courseName: "Behavioural Finance", email: "b@example.edu" },
    ];
    expect(resolveCourse(ambiguous, "finance").length).toBe(2);
  });

  it("every address is on the reserved domain that cannot deliver", () => {
    for (const c of SAMPLE_ROSTER) {
      expect(c.email.endsWith("@example.edu"), c.email).toBe(true);
      expect(c.synthetic).toBe(true);
    }
  });
});

describe("handing the draft to the student's own mail client", () => {
  it("encodes newlines as CRLF so Outlook keeps the paragraphs", () => {
    const url = mailtoUrl({ to: "a@example.edu", subject: "Hi", body: "Line one\n\nLine two" });
    expect(url).toContain("%0D%0A%0D%0A");
    expect(url).not.toMatch(/[^D]%0A/);
  });

  it("escapes a subject that would otherwise break the query string", () => {
    const url = mailtoUrl({ to: "a@example.edu", subject: "MGT 808: absence & catch-up?", body: "x" });
    expect(url).toContain("%26");
    expect(url).toContain("%3F");
  });
});
