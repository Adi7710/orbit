import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { blocksOn, occursOn, parseIcs, taskFromEvent } from "../ics";
import { blocks as fixtureBlocks } from "./fixture";
import { checkUrlShape, isPrivateAddress } from "../../services/ics";
import { POST } from "../../app/api/import/route";
import { reset, store } from "../../lib/store";

const TZ = "America/New_York";
const sample = (f: string) => readFileSync(path.join(__dirname, "../../../data", f), "utf8");
const noon = (ymd: string) => new Date(`${ymd}T12:00:00-04:00`);

describe("synthetic timetable matches the hand-computed fixture Tuesday", () => {
  const events = parseIcs(sample("pitt-tuesday.ics"));

  it("produces exactly the three fixture classes on a Tuesday", () => {
    const got = blocksOn(noon("2026-09-22"), events, TZ);
    expect(got.map((b) => ({ title: b.title, start: b.start, end: b.end, place: b.place, courseCode: b.courseCode }))).toEqual(
      fixtureBlocks.map((b) => ({ title: b.title, start: b.start, end: b.end, place: b.place, courseCode: b.courseCode })),
    );
  });

  it("has no classes on a Wednesday, before the term, or on the excluded date", () => {
    expect(blocksOn(noon("2026-09-23"), events, TZ)).toEqual([]);
    expect(blocksOn(noon("2026-08-18"), events, TZ)).toEqual([]);
    expect(blocksOn(noon("2026-11-24"), events, TZ)).toEqual([]);
    expect(blocksOn(noon("2026-12-15"), events, TZ)).toEqual([]);
  });
});

describe("day matching uses the student's zone, not the server's", () => {
  it("keeps a 20:00 New York class on its own day even though it is already tomorrow in UTC", () => {
    const [ev] = parseIcs(["BEGIN:VEVENT", "UID:eve", "SUMMARY:Evening lab", "DTSTART;TZID=America/New_York:20260922T200000", "DTEND;TZID=America/New_York:20260922T215000", "RRULE:FREQ=WEEKLY;BYDAY=TU", "END:VEVENT"].join("\n"));
    expect(ev.start.toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(occursOn(ev, noon("2026-09-22"), TZ)).toBe(true);
    expect(occursOn(ev, noon("2026-09-23"), TZ)).toBe(false);
    expect(occursOn(ev, noon("2026-09-29"), TZ)).toBe(true);
  });

  it("puts a date-only Canvas item due at 23:59 New York time", () => {
    const events = parseIcs(sample("canvas-sample.ics"));
    const essay = taskFromEvent(events.find((e) => e.summary.startsWith("Essay draft"))!, TZ);
    expect(essay.dueAt!.toISOString()).toBe("2026-09-28T03:59:00.000Z");
    expect(essay.courseCode).toBe("ENGCMP 0200");
    expect(essay.source).toBe("canvas");
    expect(essay.evidence).toEqual({ kind: "ics", uid: "sample-canvas-1005@orbit.synthetic" });
  });
});

describe("calendar link safety", () => {
  it("recognises addresses the server must never call", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "100.128.0.1", "2606:4700::1111"]) expect(isPrivateAddress(a), a).toBe(false);
  });

  it("only accepts public https links and rewrites webcal", () => {
    expect(checkUrlShape("webcal://calendar.example.edu/a.ics").protocol).toBe("https:");
    for (const bad of ["http://calendar.example.edu/a.ics", "https://localhost/a.ics", "https://foo.local/a.ics", "https://10.0.0.5/a.ics", "https://[::1]/a.ics", "https://user:pw@example.edu/a.ics", "https://intranet/a.ics", "file:///etc/passwd", "nonsense"]) {
      expect(() => checkUrlShape(bad), bad).toThrow();
    }
  });
});

describe("POST /api/import", () => {
  const prev = process.env.DEMO_CLOCK;
  beforeEach(() => { process.env.DEMO_CLOCK = "2026-09-22T13:10"; reset(); });
  afterEach(() => { if (prev === undefined) delete process.env.DEMO_CLOCK; else process.env.DEMO_CLOCK = prev; });
  const call = (body: unknown) => POST(new Request("http://x/api/import", { method: "POST", body: JSON.stringify(body) }));

  it("imports the sample timetable and Canvas feed", async () => {
    const res = await call({ sample: true });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.day).toBe("2026-09-22");
    expect(j.timetable.blocks).toBe(3);
    // 6 events: one past (Homework 2), one beyond 14 days (Final project), four in range.
    expect(j.canvas).toMatchObject({ events: 6, skippedPast: 1, skippedFar: 1 });
    const s = store();
    expect(s.blocks.map((b) => b.id.split("@")[0])).toEqual(["sample-cs0441-tue", "sample-math0220-tue", "sample-engcmp0200-tue"]);
    const canvas = s.tasks.filter((t) => t.source === "canvas");
    expect(canvas).toHaveLength(4);
    expect(canvas.every((t) => t.evidence?.kind === "ics")).toBe(true);
  });

  it("is idempotent and replaces seeded placeholders instead of duplicating them", async () => {
    await call({ sample: true });
    const first = store().tasks.map((t) => t.id).sort();
    await call({ sample: true });
    expect(store().tasks.map((t) => t.id).sort()).toEqual(first);
    expect(store().tasks.filter((t) => t.title === "Problem Set 4")).toHaveLength(1);
  });

  it("keeps a completed task completed when the feed is imported again", async () => {
    await call({ sample: true });
    const ps = store().tasks.find((t) => t.title === "Problem Set 4")!;
    ps.completedAt = new Date();
    await call({ sample: true });
    expect(store().tasks.find((t) => t.title === "Problem Set 4")!.completedAt).toBeInstanceOf(Date);
  });

  it("warns instead of failing when the day has no classes", async () => {
    const j = await (await call({ sample: true, day: "2026-09-23" })).json();
    expect(j.timetable.blocks).toBe(0);
    expect(j.warnings.join(" ")).toMatch(/No classes on 2026-09-23/);
  });

  it("rejects an empty request, a private link and a non-calendar paste without changing anything", async () => {
    const before = JSON.stringify(store().blocks);
    expect((await call({})).status).toBe(400);
    const priv = await call({ timetableUrl: "https://127.0.0.1/a.ics" });
    expect(priv.status).toBe(422);
    expect((await priv.json()).errors.timetable).toMatch(/not reachable/);
    const junk = await call({ ics: "hello" });
    expect(junk.status).toBe(422);
    expect((await junk.json()).errors.timetable).toMatch(/not an iCalendar/);
    expect(JSON.stringify(store().blocks)).toBe(before);
  });

  it("imports pasted timetable text", async () => {
    const j = await (await call({ ics: sample("pitt-tuesday.ics") })).json();
    expect(j.timetable).toMatchObject({ source: "pasted", blocks: 3 });
  });
});
