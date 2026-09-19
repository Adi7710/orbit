import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { draftEmail } from "@/agents/emailAgent";
import { findContact, mergeRoster, resolveCourse, SAMPLE_ROSTER, mailtoUrl, outlookWebUrl } from "@/core/contacts";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Draft an email to an instructor and queue it for approval.
 *
 * This endpoint never sends anything. It produces a Tier B proposal, exactly
 * like every other action that leaves the app, and approving it hands the
 * finished message to the student's own mail client.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { said?: string; course?: string; task?: string; newDate?: string; studentName?: string };
  const said = (body.said ?? "").trim();
  if (!said) return NextResponse.json({ ok: false, error: "say what you want to tell them" }, { status: 400 });

  const s = store();
  const roster = mergeRoster(SAMPLE_ROSTER, s.contacts);

  // Resolve the course from whatever they said: "MGT 808", "consulting", or
  // nothing at all, in which case we ask rather than guess a recipient.
  let contact = findContact(roster, body.course);
  if (!contact && body.course) {
    const hits = resolveCourse(roster, body.course);
    if (hits.length === 1) contact = hits[0];
    else if (hits.length > 1) {
      return NextResponse.json({ ok: false, needCourse: true, options: hits.map((h) => h.courseCode), text: `Which course: ${hits.map((h) => h.courseCode).join(", ")}?` });
    }
  }
  if (!contact) {
    const codes = [...new Set(s.tasks.map((t) => t.courseCode).filter(Boolean))].slice(0, 5);
    return NextResponse.json({ ok: false, needCourse: true, options: codes, text: `Which course is that for? ${codes.join(", ")}` });
  }

  const draft = await draftEmail(said, contact, {
    task: body.task,
    newDate: body.newDate,
    studentName: body.studentName,
    when: new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "America/New_York" }),
  });

  const proposal = {
    id: randomUUID(),
    proposal: {
      kind: "send_email" as const,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      courseCode: contact.courseCode,
      reason: `${draft.intent} email to ${contact.salutation}`,
    },
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  s.proposals.push(proposal);
  log("agent", "email_drafted", { intent: draft.intent, to: draft.to, provider: draft.provider, rejected: draft.rejected });

  return NextResponse.json({
    ok: true,
    proposalId: proposal.id,
    intent: draft.intent,
    provider: draft.provider,
    rejected: draft.rejected,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    mailto: mailtoUrl(draft),
    outlook: outlookWebUrl(draft),
    synthetic: contact.synthetic,
  });
}

/** The roster, so a UI can show who it would write to. */
export async function GET() {
  return NextResponse.json({ roster: SAMPLE_ROSTER, note: "synthetic addresses on the reserved example.edu domain; nothing can be delivered" });
}
