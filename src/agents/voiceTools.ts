import { store, log } from "@/lib/store";
import { buildToday } from "@/lib/today";
import { buildJourney, BUILDINGS } from "@/lib/journey";
import { xpFor } from "@/core/game";
import { findGaps } from "@/core/gaps";
import { fromDate, fmt } from "@/core/time";
import type { Mode, Task } from "@/core/types";

/**
 * The voice tool surface.
 *
 * One rule, and the whole design follows from it: **the server writes the
 * sentence, the model only delivers it.** Every handler returns a finished
 * spoken sentence in `text`, composed from the deterministic core. The agent
 * reads it. That makes a hallucinated XP total or bus time structurally
 * impossible, because the model never computes one.
 *
 * Numbers are also written the way they should be said: "ninety-five minutes",
 * not "95 minutes", because text-to-speech mangles bare digits less often when
 * the sentence already reads like speech.
 */

// MARK: - Speaking numbers

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function spoken(n: number): string {
  if (n < 0) return `minus ${spoken(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${spoken(n % 100)}` : ""}`;
  return `${spoken(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${spoken(n % 1000)}` : ""}`;
}

/** 589 -> "nine hours forty-nine". */
export function spokenDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${spoken(m)} minutes`;
  const hs = `${spoken(h)} hour${h === 1 ? "" : "s"}`;
  return m === 0 ? hs : `${hs} ${spoken(m)}`;
}

/** 845 -> "two eleven". Clock times read better without "PM" in a short sentence. */
export function spokenClock(minutesFromMidnight: number): string {
  const h24 = Math.floor(minutesFromMidnight / 60) % 24, m = minutesFromMidnight % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (m === 0) return `${spoken(h12)} o'clock`;
  if (m < 10) return `${spoken(h12)} oh ${spoken(m)}`;
  return `${spoken(h12)} ${spoken(m)}`;
}

// MARK: - Resolving what the student said

export interface Resolution { task?: Task; ambiguous?: Task[]; }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOPWORDS = new Set(["the", "a", "my", "that", "this", "for", "of", "and", "to", "on", "in", "it"]);

/**
 * Voice says "the problem set", the store holds `ps4` titled "Problem Set 4".
 * Exact, then substring either way, then token overlap. Two equally good
 * matches is not a guess, it is a question.
 */
export function resolveTask(spokenName: string, tasks: Task[]): Resolution {
  const live = tasks.filter((t) => !t.completedAt);
  if (live.length === 0) return {};
  const q = normalize(spokenName);
  if (!q) return { ambiguous: live.slice(0, 3) };

  const exact = live.filter((t) => normalize(t.title) === q);
  if (exact.length === 1) return { task: exact[0] };

  const contains = live.filter((t) => { const n = normalize(t.title); return n.includes(q) || q.includes(n); });
  if (contains.length === 1) return { task: contains[0] };
  if (contains.length > 1) return { ambiguous: contains.slice(0, 3) };

  const qTokens = q.split(" ").filter((w) => w && !STOPWORDS.has(w));
  const scored = live
    .map((t) => {
      const tokens = new Set(normalize(t.title).split(" ").filter((w) => w && !STOPWORDS.has(w)));
      const course = t.courseCode ? normalize(t.courseCode).split(" ") : [];
      const hits = qTokens.filter((w) => tokens.has(w) || course.includes(w)).length;
      return { t, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (scored.length === 0) return {};
  if (scored.length > 1 && scored[0].hits === scored[1].hits) return { ambiguous: scored.slice(0, 3).map((x) => x.t) };
  return { task: scored[0].t };
}

const listNames = (tasks: Task[]) => tasks.map((t) => t.title).join(", or ");

/**
 * Reasons come from the core so the screen and the voice agree, but the core
 * writes them for the eye ("95 focused minutes", "2-week streak"). Speak the
 * leading count and leave course codes like MATH 0220 alone.
 */
export function speakReason(reason: string): string {
  return reason
    .replace(/^(\d+)(?=\s)/, (_, n) => spoken(Number(n)))
    .replace(/\b(\d+)-week\b/g, (_, n) => `${spoken(Number(n))}-week`);
}

/** Capitalize the start of every sentence, since these are composed by joining fragments. */
export function asSentence(text: string): string {
  return text.trim().replace(/(^|[.!?]\s+)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

// MARK: - The tools

export type VoiceTool = "get_today" | "log_actual" | "set_mode" | "get_bus";

export interface VoiceRequest { tool: VoiceTool | string; task?: string; minutes?: number; mode?: string; destination?: string }

export async function handleVoiceTool(req: VoiceRequest): Promise<{ text: string; ok: boolean; data?: unknown }> {
  const r = await route(req);
  return { ...r, text: asSentence(r.text) };
}

async function route(req: VoiceRequest): Promise<{ text: string; ok: boolean; data?: unknown }> {
  const s = store();

  switch (req.tool) {
    case "get_today": {
      const t = await buildToday();
      const lost = t.ledger.naiveFree - t.ledger.usable;
      const parts = [
        `You have ${spokenDuration(t.ledger.usable)}, not the ${spokenDuration(t.ledger.naiveFree)} your calendar claims.`,
        `The missing ${spoken(lost)} minutes are walking, eating and getting settled.`,
      ];
      const g = t.gaps[0];
      if (g) parts.push(`Your best window is ${spokenClock(g.start)} to ${spokenClock(g.end)}, ${spokenDuration(g.usable)}${g.pick ? `, and ${g.pick.title} fits it` : ""}.`);
      else parts.push("You have no usable gap between classes today, so tonight is the plan.");
      if (t.ledger.overCommitted) parts.push(`You are over-committed by ${spoken(Math.abs(t.ledger.slack))} minutes. I can suggest what to drop.`);
      log("voice", "voice_get_today", { usable: t.ledger.usable });
      return { ok: true, text: parts.join(" ") };
    }

    case "log_actual": {
      const minutes = Math.round(Number(req.minutes));
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
        return { ok: false, text: "I did not catch how long that took. How many minutes?" };
      }
      const { task, ambiguous } = resolveTask(req.task ?? "", s.tasks);
      if (ambiguous?.length) return { ok: false, text: `Which one: ${listNames(ambiguous)}?` };
      if (!task) return { ok: false, text: `I cannot find that on today's list. You have ${listNames(s.tasks.filter((t) => !t.completedAt).slice(0, 3))}.` };

      const planned = s.estimator.planningMinutes(task);
      const now = new Date();
      const gap = findGaps(s.blocks, s.profile, s.travel).find((g) => { const n = fromDate(now, "America/New_York"); return n >= g.start && n <= g.end; });
      task.completedAt = now;
      s.estimator.record(task.courseCode, task.domain, task.estimateMinutes, minutes);
      const { xp, reasons } = xpFor({ task, actualMinutes: minutes, plannedMinutes: planned, completedInGap: gap, completedAt: now }, s.mode, s.user.streakWeeks);
      s.user.xpWeek += xp;
      const row = s.board.find((r) => r.userId === s.user.id);
      if (row) row.xpWeek = s.user.xpWeek;
      const mult = s.estimator.multiplier(task.courseCode, task.domain);
      log("voice", "task_completed", { taskId: task.id, actualMinutes: minutes, planned, xp, reasons, via: "voice" });

      const said = [`${spoken(minutes)} minutes on ${task.title}, logged.`];
      if (xp > 0) said.push(`${spoken(xp)} XP${reasons.length ? ` for ${reasons.slice(0, 2).map(speakReason).join(" and ")}` : ""}.`);
      else said.push("No XP in this mode, and your streak is safe.");
      if (task.courseCode && s.estimator.calibration().find((c) => c.key.startsWith(task.courseCode!))!.samples >= 5) {
        said.push(`Your ${task.courseCode} estimates are now ${mult.toFixed(1)} times what you guess.`);
      }
      return { ok: true, text: said.join(" "), data: { xp, taskId: task.id } };
    }

    case "set_mode": {
      const mode = String(req.mode ?? "").toLowerCase() as Mode;
      if (!["normal", "crisis", "chill"].includes(mode)) return { ok: false, text: "I can set normal, crisis, or chill. Which one?" };
      s.mode = mode;
      log("voice", "mode_changed", { mode, via: "voice" });
      const said: Record<Mode, string> = {
        crisis: "Crisis mode. Only coursework from here. XP is paused and your streak is safe.",
        chill: "Chill mode. Targets are down to forty percent and only what is due in two days stays on the list.",
        normal: "Back to normal. Everything is on the list and XP counts again.",
      };
      return { ok: true, text: said[mode], data: { mode } };
    }

    case "get_bus": {
      const dest = req.destination && req.destination in BUILDINGS ? (req.destination as keyof typeof BUILDINGS) : undefined;
      const ordered = [...s.blocks].sort((a, b) => a.start - b.start);
      const nowMin = fromDate(new Date(), "America/New_York");
      const nextClass = ordered.find((b) => b.start > nowMin);
      const goingToClass = !!nextClass && !!dest === false;
      const to = dest ?? ((nextClass?.place && nextClass.place in BUILDINGS ? nextClass.place : "Cathedral") as keyof typeof BUILDINGS);
      const from = goingToClass ? "Home" : ((ordered[ordered.length - 1]?.place ?? "Cathedral") as keyof typeof BUILDINGS);
      const j = await buildJourney({ from: from in BUILDINGS ? from : "Cathedral", to, arriveBySec: goingToClass && nextClass ? nextClass.start * 60 : undefined });
      const o = j?.options[0];
      if (!j || !o) return { ok: false, text: "There is no bus you could still catch in the next hour and a half. Walking is the plan." };

      const leaveIn = Math.round((o.leaveBySec - j.clock.sec) / 60);
      const said = [leaveIn <= 0 ? "Leave now." : `Leave in ${spoken(leaveIn)} minutes.`];
      const delay = o.delaySec && Math.abs(o.delaySec) > 59 ? `, ${spoken(Math.abs(Math.round(o.delaySec / 60)))} minutes ${o.delaySec > 0 ? "late" : "early"}` : "";
      said.push(o.status === "live" ? `The ${o.route} is live${delay}${o.vehicle ? ` and ${(o.vehicle.metersToStop / 1000).toFixed(1)} kilometres out` : ""}.` : `The ${o.route} is scheduled for ${spokenClock(Math.floor(o.departsSec / 60))}.`);
      if (j.destination.arriveBySec !== undefined) {
        said.push(o.verdict.makesIt
          ? `You are at ${j.destination.label} by ${spokenClock(Math.floor(o.arriveSec / 60))}, ${spoken(o.verdict.marginMin)} minutes before class.`
          : `That puts you ${spoken(Math.abs(o.verdict.marginMin))} minutes late. Take the earlier one or walk.`);
      } else {
        said.push(`You are home by ${spokenClock(Math.floor(o.arriveSec / 60))}.`);
      }
      if (!j.realtime.tripsOk) said.push("The live feed is down, so that is the timetable, not a prediction.");
      log("voice", "voice_get_bus", { route: o.route, status: o.status });
      return { ok: true, text: said.join(" "), data: { route: o.route } };
    }

    default:
      return { ok: false, text: "I only know your schedule, your tasks and your bus." };
  }
}

/** The opening line, spoken before the student says anything. */
export async function openingBriefing(): Promise<string> {
  const t = await buildToday();
  const lost = t.ledger.naiveFree - t.ledger.usable;
  const g = t.gaps[0];
  const bus = t.bus ? ` Leave by ${spokenClock(Number(t.bus.leaveByText.split(":")[0]) * 60 + Number(t.bus.leaveByText.split(":")[1]))} for the ${t.bus.route}.` : "";
  return [
    `Your calendar thinks you have ${spokenDuration(t.ledger.naiveFree)} free today.`,
    `You actually have ${spokenDuration(t.ledger.usable)}.`,
    `The missing ${spoken(lost)} minutes are walking, eating and getting settled.`,
    g ? `Your best window is ${spokenClock(g.start)} to ${spokenClock(g.end)}${g.pick ? `, and ${g.pick.title} fits it` : ""}.` : "",
    bus,
    "Tell me when something is done, or say crisis if today is a crisis.",
  ].filter(Boolean).join(" ");
}
