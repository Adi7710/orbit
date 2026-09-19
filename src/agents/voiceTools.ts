import { store, log } from "@/lib/store";
import { buildToday } from "@/lib/today";
import { buildJourney, BUILDINGS } from "@/lib/journey";
import { xpFor } from "@/core/game";
import { findGaps } from "@/core/gaps";
import { fromDate, fmt } from "@/core/time";
import type { Mode, Task } from "@/core/types";
import { buildHabitProfile, type TimeBucket } from "@/core/habits";
import { habitInsightsCached, peekInsights } from "./habitAgent";
import { recordHabit } from "@/lib/habitLog";
import { randomUUID } from "node:crypto";
import { findContact, mergeRoster, resolveCourse, SAMPLE_ROSTER } from "@/core/contacts";
import { draftEmail } from "./emailAgent";
import { ask } from "./ask";
import { countThings, greetingWord, naturalClock, naturalDue, naturalDuration, partOfDay } from "@/core/say";

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

/**
 * Insight sentences are written for the eye ("21% faster", "1.53x", "5.88 hours").
 * Read aloud, bare digits get mangled, so speak every number the way a person would.
 */
export function speakNumbers(text: string): string {
  const say = (raw: string) => {
    const [whole, frac] = raw.split(".");
    return frac ? `${spoken(Number(whole))} point ${frac.split("").map((d) => spoken(Number(d))).join(" ")}` : spoken(Number(whole));
  };
  return text
    .replace(/(\d+(?:\.\d+)?)%/g, (_, n) => `${say(n)} percent`)
    .replace(/(\d+(?:\.\d+)?)x\b/g, (_, n) => `${say(n)} times`)
    .replace(/\d+(?:\.\d+)?/g, (n) => say(n));
}

/** The written labels say "between 5 and 10 PM"; speech wants words. */
const BUCKET_SPOKEN: Record<TimeBucket, string> = { morning: "before noon", midday: "between noon and five", evening: "between five and ten at night", late: "after ten at night" };

/** Capitalize the start of every sentence, since these are composed by joining fragments. */
export function asSentence(text: string): string {
  return text.trim().replace(/(^|[.!?]\s+)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

// MARK: - The tools

export type VoiceTool = "get_today" | "log_actual" | "set_mode" | "get_bus" | "get_estimate" | "get_coach" | "draft_email" | "ask" | "why";

export interface VoiceRequest { tool: VoiceTool | string; task?: string; minutes?: number; mode?: string; destination?: string; said?: string; course?: string; newDate?: string }

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
      const g = t.gaps[0];
      const windDown = s.profile.sleepStart - s.profile.windDownMinutes;

      // Said the way someone who knew your schedule would say it: what you
      // have, when you stop, what to start. The ledger arithmetic is the
      // reason behind the answer, not the answer itself -- it is still one
      // question away, in `why`, and it is still on the screen.
      const parts: string[] = [];
      if (g) {
        parts.push(`You have ${partOfDay(g.start)}, ${naturalDuration(g.usable)} of it, and you are winding down around ${naturalClock(windDown)}.`);
      } else {
        parts.push("You have nothing clear left today, so tonight is the plan.");
      }
      parts.push(`${countThings(t.tasks.length)} still on your list.`);
      if (g?.pick) {
        const pickTask = t.tasks.find((x) => x.id === g.pick!.id);
        const due = naturalDue(pickTask?.dueAt);
        // "the way you actually work" has to be the calibrated figure. Problem
        // Set 4 is ninety minutes raw and a hundred and forty-four once the
        // 1.6x multiplier is in; saying the raw number while claiming it is
        // personalised is worse than not personalising it at all.
        parts.push(`I would start with ${g.pick.title}${due ? `, it is ${due}` : ""}, and it runs ${naturalDuration(pickTask?.planningMinutes ?? g.pick.estimateMinutes)} the way you actually work.`);
      }
      if (t.ledger.overCommitted) {
        parts.push(`Worth knowing: your calendar says ${spokenDuration(t.ledger.naiveFree)} free today and only ${spokenDuration(t.ledger.usable)} of that is real, the ${spoken(lost)} minutes in between being walking, eating and settling in. Say the word and I will tell you what to drop.`);
      }
      log("voice", "voice_get_today", { usable: t.ledger.usable, overCommitted: t.ledger.overCommitted });
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
      recordHabit(task, minutes, now, !!gap);
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

    case "get_estimate": {
      const { task, ambiguous } = resolveTask(req.task ?? "", s.tasks);
      if (ambiguous?.length) return { ok: false, text: `Which one: ${listNames(ambiguous)}?` };
      if (!task) return { ok: false, text: `I cannot find that on your list. You have ${listNames(s.tasks.filter((t) => !t.completedAt).slice(0, 3))}.` };

      const own = task.estimateMinutes;
      const planned = s.estimator.planningMinutes(task);
      const said: string[] = [];
      if (planned !== own) said.push(`You would say ${spokenDuration(own)} for ${task.title}, but your history says ${spokenDuration(planned)}, so that is what I plan.`);
      else said.push(`${task.title} is ${spokenDuration(planned)}, and your history has no reason to change that yet.`);

      const profile = buildHabitProfile(s.habits);
      if (profile.best && task.domain !== "body") said.push(`You work fastest ${BUCKET_SPOKEN[profile.best.bucket]}.`);
      const fit = findGaps(s.blocks, s.profile, s.travel).find((g) => g.usable >= planned);
      if (fit) said.push(`It fits your ${spokenClock(fit.start)} to ${spokenClock(fit.end)} window.`);
      else said.push("It does not fit any single gap today, so it would need to be split.");
      log("voice", "voice_get_estimate", { taskId: task.id, own, planned });
      return { ok: true, text: said.join(" "), data: { taskId: task.id, own, planned } };
    }

    case "get_coach": {
      const profile = buildHabitProfile(s.habits);
      if (profile.sessions < 6) {
        return { ok: true, text: `I only have ${spoken(profile.sessions)} finished sessions so far, which is not enough to say anything real. Tell me when you finish things and how long they took.` };
      }
      // Never wait on the model here: answer from the cache, and warm it for next time.
      const cached = peekInsights(profile);
      const result = cached ?? (await habitInsightsCached(profile, { useModel: false }));
      if (!cached) void habitInsightsCached(profile).catch(() => {});
      if (result.insights.length === 0) return { ok: true, text: "Nothing stands out in your history yet." };
      const [first, second] = result.insights;
      const said = ["Here is what your history says.", speakNumbers(first.text), speakNumbers(first.suggestion)];
      if (second) said.push(speakNumbers(second.text));
      log("voice", "voice_get_coach", { source: result.provider, insights: result.insights.length });
      return { ok: true, text: said.join(" "), data: { provider: result.provider, kinds: result.insights.map((i) => i.kind) } };
    }

    case "draft_email": {
      const said = (req.said ?? req.task ?? "").trim();
      if (!said) return { ok: false, text: "Tell me what you want to say to them and I will write it." };

      const roster = mergeRoster(SAMPLE_ROSTER, s.contacts);
      let contact = findContact(roster, req.course);
      if (!contact && req.course) {
        const hits = resolveCourse(roster, req.course);
        if (hits.length === 1) contact = hits[0];
        else if (hits.length > 1) return { ok: false, text: `Which course: ${hits.map((h) => h.courseCode).join(", ")}?` };
      }
      if (!contact) {
        const codes = [...new Set(s.tasks.map((t) => t.courseCode).filter(Boolean))].slice(0, 4);
        return { ok: false, text: codes.length ? `Which course is that for? ${codes.join(", ")}.` : "Which course is that for?" };
      }

      const draft = await draftEmail(said, contact, {
        task: req.task && req.task !== said ? req.task : undefined,
        newDate: req.newDate,
        when: new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "America/New_York" }),
      });

      const id = randomUUID();
      s.proposals.push({ id, proposal: { kind: "send_email", to: draft.to, subject: draft.subject, body: draft.body, courseCode: contact.courseCode, reason: `${draft.intent} email to ${contact.salutation}` }, status: "pending", createdAt: new Date().toISOString() });
      log("agent", "voice_draft_email", { intent: draft.intent, provider: draft.provider, rejected: draft.rejected });

      // Read the letter back. It is going to another human being, so the
      // student hears every word before they are asked to approve it, and
      // the tool says plainly that nothing has been sent.
      return {
        ok: true,
        text: `I have written it to ${contact.salutation}. Subject: ${draft.subject}. It reads: ${draft.body.replace(/\n+/g, " ")} Nothing is sent. It is waiting for you to approve it on screen.`,
        data: { proposalId: id, intent: draft.intent },
      };
    }

    case "ask": {
      // Anything the dedicated tools do not cover. Grounded in the factsheet,
      // verified before it is spoken, and honest when the facts run out --
      // which replaced a blanket "I only know your schedule, your tasks and
      // your bus", true and useless for every real question.
      const q = (req.said ?? req.task ?? "").trim();
      if (!q) return { ok: false, text: "Ask me about your day and I will tell you what I actually know." };
      const a = await ask(q, await buildToday());
      log("voice", "voice_ask", { provider: a.provider, grounded: a.check.ok, cited: a.check.cited.length });
      // Numbers are spoken, not printed, for the same reason as everywhere else.
      return { ok: a.provider !== "refused", text: speakNumbers(a.text), data: { because: a.because.map((b) => b.key), provider: a.provider } };
    }

    case "why": {
      // Defending an answer is a lookup, not a second opinion: each fact
      // carries the code it came from.
      const q = (req.said ?? req.task ?? "").trim();
      const a = await ask(q || "how much time do I have today", await buildToday());
      if (a.because.length === 0) return { ok: false, text: "I did not have anything to base that on, which is why I did not answer it." };
      const top = a.because.slice(0, 2);
      // Joined fragments, so the leading capital has to go or it reads
      // "Because You have...". And a source is written for a developer
      // ("computeLedger in src/core/ledger.ts"); spoken aloud a file path is
      // noise, so only the human-readable part survives.
      const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
      const plainSource = top[0].source.replace(/\s*in\s+src\/[\w/.]+/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      return {
        ok: true,
        text: speakNumbers(`Because ${lower(top[0].text)}${top[1] ? ` And ${lower(top[1].text)}` : ""} That comes from ${plainSource}.`),
        data: { keys: top.map((b) => b.key) },
      };
    }

    default:
      // Unknown tool names fall through to the open question path rather than
      // refusing, so a new phrasing never produces a dead end.
      return route({ ...req, tool: "ask", said: req.said ?? req.task ?? String(req.tool) });
  }
}

/**
 * The line Orbit actually opens a call with.
 *
 * Separate from the full briefing on purpose. The briefing is the honest
 * accounting and it belongs on the page and in the answer to "what does my day
 * look like"; leading a conversation with it means the first thing a student
 * hears is a paragraph of arithmetic, which is not a welcome.
 *
 * This is short, warm, and hands the turn straight back. It still carries one
 * real number, because an opening that says nothing true is just a doorbell --
 * and that number is composed here, server-side, for the same reason every
 * other number is.
 */
export async function openingGreeting(): Promise<string> {
  return asSentence(await composeGreeting());
}

async function composeGreeting(): Promise<string> {
  const t = await buildToday();
  const s = store();
  const name = t.user.name;
  const g = t.gaps[0];
  const nowMin = g ? g.start : fromDate(new Date());
  const hello = `${greetingWord(nowMin)}, ${name}.`;

  if (t.mode === "crisis") {
    return `${hello} You are in crisis mode, so it is coursework only and nothing is counting against you. What do you want to get through?`;
  }

  // What a person who knew your schedule would actually lead with: what is
  // left, when you are stopping, and the one thing they would start. Not a
  // measurement of the evening.
  const open = g ? `${hello} You have ${partOfDay(g.start, true)}` : hello;
  const windDown = s.profile.sleepStart - s.profile.windDownMinutes;
  const until = g ? `, and you are winding down around ${naturalClock(windDown)}.` : "";

  const pick = g?.pick;
  const openCount = t.tasks.length;
  if (!openCount) return `${open}${until} Nothing on your list, which is allowed. Tell me if something comes up.`;

  const left = `${countThings(openCount)} still on your list.`;
  if (!pick) return `${open}${until} ${left} Ask me what to start and I will tell you.`;

  const pickTask = t.tasks.find((x) => x.id === pick.id);
  const due = naturalDue(pickTask?.dueAt);
  // The calibrated figure, not the raw estimate -- see get_today.
  const size = naturalDuration(pickTask?.planningMinutes ?? pick.estimateMinutes);
  return `${open}${until} ${left} I would start with ${pick.title}${due ? `, it is ${due}` : ""}, and it runs ${size} the way you actually work. Shall I set you up with that?`;
}

/** The opening line, spoken before the student says anything. */
export async function openingBriefing(): Promise<string> {
  const t = await buildToday();
  const lost = t.ledger.naiveFree - t.ledger.usable;
  const g = t.gaps[0];
  const bus = t.bus ? ` Leave by ${spokenClock(Number(t.bus.leaveByText.split(":")[0]) * 60 + Number(t.bus.leaveByText.split(":")[1]))} for the ${t.bus.route}.` : "";
  return [
    // Greet by name, the same way the page does. The briefing is composed
    // server-side, so this is the one place a name can appear in speech
    // without the model being trusted to remember it.
    `Hey ${t.user.name}.`,
    `Your calendar thinks you have ${spokenDuration(t.ledger.naiveFree)} free today.`,
    `You actually have ${spokenDuration(t.ledger.usable)}.`,
    `The missing ${spoken(lost)} minutes are walking, eating and getting settled.`,
    g ? `Your best window is ${spokenClock(g.start)} to ${spokenClock(g.end)}${g.pick ? `, and ${g.pick.title} fits it` : ""}.` : "",
    bus,
    "Tell me when something is done, or say crisis if today is a crisis.",
  ].filter(Boolean).join(" ");
}
