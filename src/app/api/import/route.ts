import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { blocksOn, isClassMeeting, parseIcs, resolveCourseCodes, taskFromEvent } from "@/core/ics";
import type { Task } from "@/core/types";
import { fetchIcs, IcsFetchError } from "@/services/ics";
import { clock } from "@/services/prt";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "America/New_York";
const MAX_TEXT = 3 * 1024 * 1024;

interface Body {
  timetableUrl?: string;
  canvasUrl?: string;
  /** Raw .ics text for the timetable / Canvas feed, for pasting or offline demos. */
  ics?: string;
  canvasIcs?: string;
  /** Load the bundled synthetic timetable and Canvas feed (no network needed). */
  sample?: boolean;
  /** YYYY-MM-DD; defaults to the planning clock's day (DEMO_CLOCK when pinned). */
  day?: string;
  /** Only Canvas items due within this many days are imported. Default 14. */
  horizonDays?: number;
}

const sampleText = (file: string) => readFile(path.join(process.cwd(), "data", file), "utf8");
const requireIcs = (text: string) => {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsFetchError("that text is not an iCalendar (.ics) feed");
  return text;
};
const taskKey = (t: Pick<Task, "title" | "courseCode">) => `${t.courseCode ?? ""}|${t.title.trim().toLowerCase()}`;

/**
 * Timetable and Canvas import. The timetable replaces today's fixed blocks;
 * Canvas items become tasks, upserted by ICS uid so importing twice changes
 * nothing. Agents never call this: it is the student's own data entry.
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 }); }

  const timetableSrc = body.sample ? "sample" : body.timetableUrl?.trim() ? "url" : body.ics?.trim() ? "pasted" : undefined;
  const canvasSrc = body.sample ? "sample" : body.canvasUrl?.trim() ? "url" : body.canvasIcs?.trim() ? "pasted" : undefined;
  if (!timetableSrc && !canvasSrc) return NextResponse.json({ ok: false, error: "give a timetableUrl, canvasUrl, ics text, or sample: true" }, { status: 400 });
  if ((body.ics?.length ?? 0) > MAX_TEXT || (body.canvasIcs?.length ?? 0) > MAX_TEXT) return NextResponse.json({ ok: false, error: "calendar text is larger than 3 MB" }, { status: 413 });

  const c = clock();
  const ymd = body.day ? body.day.replace(/-/g, "") : c.ymd;
  if (!/^\d{8}$/.test(ymd)) return NextResponse.json({ ok: false, error: "day must be YYYY-MM-DD" }, { status: 400 });
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const noon = new Date(`${iso}T12:00:00-04:00`);
  if (Number.isNaN(noon.getTime())) return NextResponse.json({ ok: false, error: "day is not a real date" }, { status: 400 });

  const load = async (src: "sample" | "url" | "pasted", url: string | undefined, pasted: string | undefined, sampleFile: string) =>
    src === "sample" ? sampleText(sampleFile) : src === "url" ? fetchIcs(url!) : requireIcs(pasted as string);

  const s = store();
  const warnings: string[] = [];
  const errors: Record<string, string> = {};
  const out: { timetable?: unknown; canvas?: unknown } = {};

  if (timetableSrc) {
    try {
      const events = parseIcs(await load(timetableSrc, body.timetableUrl, body.ics, "pitt-tuesday.ics"));
      const blocks = blocksOn(noon, events, TZ);
      s.blocks = blocks;
      if (events.length === 0) warnings.push("The timetable had no events.");
      else if (blocks.length === 0) warnings.push(`No classes on ${iso}. Set DEMO_CLOCK or pass day to pick a class day.`);
      log("user", "timetable_imported", { source: timetableSrc, events: events.length, blocks: blocks.length, day: iso });
      out.timetable = { source: timetableSrc, events: events.length, blocks: blocks.length, titles: blocks.map((b) => b.title) };
    } catch (e) {
      errors.timetable = e instanceof IcsFetchError ? e.message : "could not read that timetable";
    }
  }

  if (canvasSrc) {
    try {
      const events = parseIcs(await load(canvasSrc, body.canvasUrl, body.canvasIcs, "canvas-sample.ics"));
      const horizon = Math.min(Math.max(Math.round(body.horizonDays ?? 14), 1), 120);
      const dayStart = new Date(`${iso}T00:00:00-04:00`).getTime();
      const dayEnd = dayStart + (horizon + 1) * 864e5;
      let added = 0, updated = 0, skippedPast = 0, skippedFar = 0, skippedMeetings = 0;
      // Learn course codes across the whole feed first. Canvas writes the code
      // on class meetings and the course name on everything, so one pass up
      // front lets every assignment borrow its own code.
      const codes = resolveCourseCodes(events.map((x) => x.summary));
      for (const e of events) {
        // A class meeting is not a piece of work. Importing it as a task
        // invents coursework nobody has to do, inflates the capacity ledger,
        // and then feeds that fiction into the habit history.
        if (isClassMeeting(e.summary)) { skippedMeetings++; continue; }
        const task = taskFromEvent(e, TZ, codes);
        const due = task.dueAt!.getTime();
        if (due < dayStart) { skippedPast++; continue; }
        if (due >= dayEnd) { skippedFar++; continue; }
        const byUid = s.tasks.find((x) => x.id === task.id);
        // A seeded placeholder for the same course and title is replaced, not duplicated.
        const seeded = byUid ? undefined : s.tasks.find((x) => x.source === "canvas" && !x.evidence && taskKey(x) === taskKey(task));
        const existing = byUid ?? seeded;
        if (existing) {
          const idx = s.tasks.indexOf(existing);
          s.tasks[idx] = { ...task, completedAt: existing.completedAt, isPriority: existing.isPriority };
          updated++;
        } else {
          s.tasks.push(task);
          added++;
        }
      }
      log("user", "canvas_imported", { source: canvasSrc, events: events.length, added, updated, skippedPast, skippedFar });
      out.canvas = { source: canvasSrc, events: events.length, added, updated, skippedPast, skippedFar, skippedMeetings, horizonDays: horizon };
    } catch (e) {
      errors.canvas = e instanceof IcsFetchError ? e.message : "could not read that Canvas feed";
    }
  }

  const failed = Object.keys(errors).length > 0;
  const succeeded = Boolean(out.timetable || out.canvas);
  return NextResponse.json({ ok: succeeded && !failed, day: iso, ...out, warnings, errors }, { status: failed && !succeeded ? 422 : 200 });
}
