import { NextResponse } from "next/server";
import { mergeRoster, normaliseCode, SAMPLE_ROSTER, type Contact } from "@/core/contacts";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The roster as the app will actually use it: sample, with the student's corrections on top. */
export async function GET() {
  const s = store();
  s.contacts ??= [];
  return NextResponse.json({
    roster: mergeRoster(SAMPLE_ROSTER, s.contacts),
    note: "Addresses ending @example.edu are synthetic placeholders and cannot receive mail. Anything you correct here is held in memory only and is never written to disk or committed.",
  });
}

/**
 * Correct one instructor's details.
 *
 * This is the only way a real address enters Orbit, and it is deliberately
 * manual and per-course: the student types it, in their own running app, and
 * it lives in memory until the server restarts. There is no import of a real
 * staff directory, because scraping one and shipping it in a public repo is a
 * different kind of problem than the one we are solving.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<Contact>;
  const courseCode = (b.courseCode ?? "").trim();
  const email = (b.email ?? "").trim();
  if (!courseCode) return NextResponse.json({ ok: false, error: "courseCode required" }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "that is not an email address" }, { status: 400 });

  const s = store();
  s.contacts ??= [];
  const known = [...SAMPLE_ROSTER, ...s.contacts].find((c) => normaliseCode(c.courseCode) === normaliseCode(courseCode));
  const name = (b.name ?? known?.name ?? "").trim() || "Your instructor";
  // "Dr. Alice Ruiz" -> "Professor Ruiz". A letter that opens "Dear Your
  // instructor," is worse than not writing it.
  const surname = name.replace(/^(dr|prof(essor)?)\.?\s+/i, "").trim().split(/\s+/).pop();
  const salutation = (b.salutation ?? known?.salutation ?? "").trim() || (surname ? `Professor ${surname}` : "Professor");

  const next: Contact = { courseCode, courseName: b.courseName ?? known?.courseName, name, email, salutation, synthetic: false };
  const i = s.contacts.findIndex((c) => normaliseCode(c.courseCode) === normaliseCode(courseCode));
  if (i >= 0) s.contacts[i] = next;
  else s.contacts.push(next);

  // The address is the student's own data; log that it changed, never what to.
  log("user", "instructor_saved", { courseCode, synthetic: false });
  return NextResponse.json({ ok: true, contact: next, roster: mergeRoster(SAMPLE_ROSTER, s.contacts) });
}
