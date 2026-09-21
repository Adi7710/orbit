# Orbit

[![ci](https://github.com/Adi7710/orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/Adi7710/orbit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![tests](https://img.shields.io/badge/tests-323%20passing-brightgreen)
![built at](https://img.shields.io/badge/built%20at-SteelHacks%20XIII%2C%2024h-8A2BE2)

**Your calendar says you have 13h 35m free today. You have 9h 07m.**

Orbit counts the commute, the meals and the settling-in, finds the real windows between classes, puts one thing in each, tells you when to stand up for the train, takes *"that took ninety-five minutes"* by voice, learns each week what you are actually like, points you at the next hackathon, and ranks you against your crew — without ever telling you that you did badly.

Built at **SteelHacks XIII**, 19–20 September 2026, for a student living in Jersey City and studying at Stevens. Web app (Next.js 16 / React 19), iOS app (SwiftUI), one server.

> All code in this repository was started after 11:00 AM EST on 19 September 2026.
> AI tools used: **Claude** (Anthropic) via Claude Code for design, code and review, and at runtime as a Day Agent tier and the Email Agent; **NVIDIA Nemotron** at runtime for planning, estimation, syllabus parsing, judging the other agents, and learning the student; **ElevenLabs** for the voice.

---

## The demo, in five beats

| # | What you see | What is underneath |
|---|---|---|
| 1 | **13h 35m crossed out, 9h 07m real**, the missing 268 minutes itemised as four rings | `computeLedger` in `src/core/ledger.ts`, pure and tested |
| 2 | **Plan my day** — the agent proposes one task per window, you approve one, it lands | Nemotron first, Claude second, code last; every id checked; the provider line says who answered |
| 3 | **The train** — tap through to the map: Hudson-Bergen Light Rail from Marin Boulevard, calling points, leave by 13:36, nine minutes to spare | One journey builder feeds the card, the map and the voice, so they cannot disagree |
| 4 | **Voice** — *"The problem set took ninety-five minutes."* XP fires, the calibration multiplier moves. *"When do I need to leave?"* *"Why?"* | Nine server tools return finished sentences; the model never computes a number |
| 5 | **`/eval`** — a ten-line heuristic beat the model, the clamp fixed it, and what it learned about this student this week | `src/app/eval`, cached so it opens instantly |

Reference numbers at Tuesday 13:20: leave **13:36**, HBLR **13:47**, at Babbio **14:21**, **9 min** to spare — identical on the card, the map and the voice.

---

## Three rules the whole design follows

1. **The client never computes a number.** Every minute, XP value and time arrives from the server already worded. The phone and the web page can never disagree, because there is one arithmetic and it lives in `src/core/`, which has no framework and no network and is covered by 323 tests.
2. **The model never computes a number either.** Voice tools return finished sentences the model reads back. Open questions are answered from an enumerable factsheet and checked — an answer containing a number the facts did not license is rejected before anyone hears it. Proven by a 24-question bank that runs every ten minutes (`docs/selfeval.md`).
3. **Agents propose, humans approve.** Only `/api/proposals/[id]` turns a proposal into an action. No agent has a tool that books, sends or moves anything. The Email Agent drafts; it never sends.

---

## Where Nemotron runs — and where it was removed

None of it is chat. The judge's page is **`/eval`**; the write-up is `docs/nvidia.md`.

| Job | Guardrail |
|---|---|
| Plans the day | `move_task` and `book_room` only; every id checked; code fills what it skips; a race between two models, the last good plan served while a fresh one is asked for |
| Estimates task minutes | Anchored to the heuristic, clamped to 0.5–2× in the pure core; property-tested with no key |
| Parses syllabus PDFs | Every deadline carries a page and a box, or it is dropped |
| Judges the other agents | LLM-as-judge with a reward ledger; can lower trust, never raise it |
| Learns the student | One week at a time, in context, with its own memo; eleven aspects, each inert until it has evidence; code writes every sentence; the screen says which facts were the model's |
| ~~Rewords spoken answers~~ | **Removed.** It turned "nothing to leave for" into "leave at 9:05". |

Measured on submission morning: heuristic **16.3** MAE, Nemotron zero-shot **35.3**, anchored **15–20**. The learner wins on assignment length and procrastination, ties on exam cramming, loses to a median on walking speed — we ship the median. Nothing was fine-tuned. Two findings worth knowing: a strict `response_format` JSON schema makes the endpoint emit tab characters for 15 s (prompt-only answers in 800 ms), and pooled keep-alive sockets hang where fresh connections do not.

---

## What is real and what is synthetic

- **Classes and deadlines:** imported from a real Canvas calendar feed (`POST /api/import`); the seeded day mirrors the three courses on it.
- **Transit:** NJ TRANSIT rail GTFS (light rail) and PATH GTFS, public and keyless; PATH departures live from the Port Authority board. The light rail is a timetable and the app says so per departure. With no vehicle positions published, the map draws the train where the timetable says it is and labels it *scheduled*.
- **Instructor addresses:** synthetic, on `@example.edu`, which cannot deliver. A real address is typed in at runtime and never persisted.
- **Friends, the crew board, the hackathon listings, the pulse notices:** synthetic and flagged `synthetic: true` in the payload.
- **Keys:** live only in `.env.local`. Nothing in the demo depends on one being present; every model call records which provider answered.

---

## Architecture

```
src/core                pure, tested arithmetic: no framework, no network
  ledger.ts             awake − classes − travel − meals − routines = usable
  gaps.ts               windows with the walk and settle removed; clipped to now
  estimator.ts          guess vs actual per course; trimmed, capped, clamped
  ics.ts                RFC 5545: folding, TZID, RRULE, EXDATE, Canvas titles
  factsheet.ts          every fact Orbit may say, keyed and sourced
  answerCheck.ts        an answer may not contain a number the facts did not license
  questionBank.ts       24 questions, answered or honestly refused, every ten minutes
  modes.ts, deadlines.ts   Chill / Normal / Crisis as a config contract
  aspects.ts            eleven things Orbit can learn about a student
  opportunities.ts      hackathons and competitions, ranked; the growth plan
  transitRelevance.ts   whether a trip is worth computing now (idle = nothing fetched)
  geo.ts, say.ts, game.ts, overlap.ts, habits.ts, travel.ts, time.ts, contacts.ts, emailDraft.ts
src/agents
  dayAgent.ts           proposes; Nemotron, then Claude, then code
  ask.ts                grounded open questions, verified before they are spoken
  critic.ts             can lower trust, never raise it
  weeklyLearner.ts, learner.ts   Nemotron learns one week at a time
  emailAgent.ts         drafts, never sends
  watcher.ts            two-tier autonomy: acts on small things, proposes the rest
  models.ts             one Nemotron call: prompt-only, fresh socket, race, failover
src/services
  schedule.ts           GTFS slice, indexed by stop and trip; ORBIT_REGION picks the city
  path.ts, prt.ts, alerts.ts, vehicles.ts
src/lib
  journey.ts            one journey builder for the map, the card and the voice
  today.ts              everything a Today screen needs
  learned.ts            one learned profile per student; every multiplier is 1 until earned
  store.ts              in-memory store, seeded per region
src/app                 Today, /map, /eval, the email modal; src/app/api/* routes
ios/Orbit               SwiftUI: Today, Crew, Calendar, Map, Settings, voice
scripts                 tunnel (self-healing, bakes its URL into the app), warm, selfeval-loop, learn-loop
docs                    nvidia, transit, voice, selfeval, eval, email, theme, copy, learning/
DECISIONS.md            every decision and why, in order, append-only
```

---

## Run it

```
cp .env.example .env.local        # keys optional; everything degrades to deterministic mode
npm install
npm test                          # 323 tests
npm run dev -- -p 3123            # http://localhost:3123  ·  /map  ·  /eval
node scripts/tunnel.mjs 3123      # public URL; re-points the voice tools and the iOS project itself
node scripts/warm.mjs             # before a demo: review, eval cache, plan cache, voice token
```

- `ORBIT_REGION=hudson` (default) is Jersey City → Stevens; `oakland` is Pittsburgh, kept because the transit regression tests are pinned to it.
- `DEMO_CLOCK=2026-09-22T13:20` pins the planning clock to a weekday afternoon for weekend judging.
- **iOS:** `cd ios/Orbit && xcodegen generate`, open `Orbit.xcodeproj`, Run. `ORBIT_API_BASE` defaults to `http://localhost:3123` (a dev server on the same Mac); point it at a deployment with `xcodebuild ORBIT_API_BASE=https://…`. The app holds no keys.

---

## Team

| | |
|---|---|
| **Aditya Bhatia** ([@Adi7710](https://github.com/Adi7710)) | lead, backend, voice, transit, design |
| **Jatin Srivastava** ([@jatinsrivastava11](https://github.com/jatinsrivastava11)) | Nemotron, the weekly learner, the mode system, Canvas import, the web accessibility pass |
| **Anmol Hazari** ([@anmolhazari](https://github.com/anmolhazari)) | the iOS app, the Xcode project, the map |
| **Akshat** ([@ak8hat](https://github.com/ak8hat)) | theme, copy, the classic screens, the on-device builds |

Built with Claude Code as the engineering partner throughout; the credit line at the top says exactly what the AI did.

## Status

Hackathon complete (20 September 2026). The repository is kept as it shipped, plus a CI workflow, a licence, and this README. Ongoing work is in the [Roadmap](https://github.com/Adi7710/orbit/issues/32) issue.

## Not done, said plainly

- `ANTHROPIC_API_KEY` is not set; the Claude tier is dormant. The free NVIDIA endpoint drops roughly half of first attempts on a busy morning; the race, the fresh sockets and the served-last-plan are what keep that off the screen.
- The store is in memory and resets on restart. No transfers between lines, no Stevens shuttle, no rate limiting, no Google Maps key (walks are straight-line estimates, marked as such).
- The iOS app is built and runs on hardware; the last few Swift edits were made without a compiler and are labelled so in `DECISIONS.md`.

## Docs

`docs/nvidia.md` · `docs/transit.md` · `docs/voice.md` · `docs/selfeval.md` · `docs/eval.md` · `docs/email.md` · `docs/theme.md` · `docs/copy.md` · `docs/learning/` · `DECISIONS.md`
