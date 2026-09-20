# Orbit

Your calendar says you have 13h 35m free today. You have 9h 07m. Orbit counts the commute, the meals and the settling-in, finds the real windows between classes, puts one thing in each, tells you when to stand up for your train, takes "that took ninety-five minutes" by voice, drafts the email to your professor, and turns the day into quests you can only complete by actually doing them.

Built at SteelHacks XIII, 19-20 September 2026, for a student living in Jersey City and studying at Stevens. All code in this repository was started after 11:00 AM EST on 19 September 2026. AI tools used: Claude (Anthropic) via Claude Code for design, code and review, and as the runtime Day Agent and Critic; NVIDIA Nemotron at runtime for task-minute estimation and syllabus parsing; ElevenLabs for the voice.

## The numbers on the screen, and where they come from

| The ledger says | Minutes | Source |
|---|---|---|
| Your calendar claims free | 815 (13h 35m) | awake window minus classes |
| Travel it never counted | 88 | 44 minutes each way, Jersey City to Babbio: walk to Marin Boulevard, Hudson-Bergen Light Rail, the climb from Hoboken Terminal |
| Meals | 115 | profile |
| Settling in | 65 | profile |
| **Actually usable** | **547 (9h 07m)** | `computeLedger` in `src/core/ledger.ts` |

Every number Orbit says out loud is computed in `src/core/`, which has no framework and no network and is covered by 220 tests. The language model never does arithmetic: the server composes the sentence and the model reads it.

## What is real and what is synthetic

- **Classes and deadlines:** imported from a real Canvas calendar feed (`POST /api/import`). The seeded day mirrors the three courses on that feed.
- **Transit:** NJ TRANSIT rail GTFS (Hudson-Bergen Light Rail) and PATH GTFS, both public, both keyless. PATH departures are live from the Port Authority's RidePATH board. The light rail is a timetable and the app says so, per departure, rather than dressing a schedule row as a prediction. See `docs/transit.md`.
- **Instructor addresses:** synthetic, on `@example.edu`, which cannot deliver. A real address is typed in at runtime and never persisted. See `docs/email.md`.
- **Estimator history:** six seeded sessions so a calibration multiplier is live on first load; real completions replace them.
- **Keys:** live only in `.env.local`. Nothing in the demo depends on one being present. Every model call records which provider answered, so degraded mode is visible rather than silent.

## Tracks

- **NVIDIA "Beyond the Chatbot":** Nemotron estimates task minutes and domains (not chat), clamped to the student's own calibration, and is scored against a session log at `/api/eval`: MAE, within-25% hit rate, latency, provider. Nemotron Parse reads syllabus PDFs into deadlines with bounding-box provenance.
- **ElevenLabs "Out Loud":** a voice agent with nine server tools gives the briefing from the real ledger, takes the evening "how long did it really take" check-in that moves the calibration, answers open questions from an enumerable factsheet, and can defend any answer with `why`. See `docs/voice.md` and `docs/selfeval.md`.
- **LANXESS "Xtract":** every imported deadline links back to its source: an ICS uid, or a syllabus page and box.
- General.

## Architecture

```
src/core                pure, tested arithmetic: no framework, no network
  ledger.ts             awake - classes - travel - meals - routines = usable; cut suggestions
  gaps.ts               between-class windows with the walk and settle removed; clipped to now
  estimator.ts          guess vs actual per course; trimmed, capped, clamped to [0.5x, 2x] of baseline
  ics.ts                RFC 5545 reader: folding, TZID, RRULE, EXDATE, Canvas titles, course codes
  factsheet.ts          every fact Orbit may say, keyed and sourced
  answerCheck.ts        an answer may not contain a number the factsheet did not license
  questionBank.ts       24 questions the app must answer, or honestly refuse, every ten minutes
  transitRelevance.ts   whether a trip is worth computing right now (idle = nothing fetched)
  aspects.ts            eleven things Orbit can learn about a student, each inert until it has evidence
  say.ts                natural durations and clock times for speech
  emailDraft.ts, contacts.ts, game.ts, overlap.ts, habits.ts, travel.ts, time.ts
src/agents
  dayAgent.ts           proposes; every tool call is a proposal a human approves. Nemotron, then Claude, then code
  learner.ts, weeklyLearner.ts   Nemotron learns one week at a time, carrying its own memo; code clamps
  ask.ts                grounded open questions, verified before they are spoken
  critic.ts             LLM-as-judge with a reward ledger; can only lower trust, never raise it
  emailAgent.ts         drafts, never sends
  watcher.ts            two-tier autonomy: acts on small things, proposes the rest
  habitAgent.ts, estimate.ts, parse.ts, syllabus.ts, voiceTools.ts, models.ts
src/services
  schedule.ts           GTFS slice, indexed by stop and by trip; ORBIT_REGION picks the city
  path.ts               PATH live departures
  prt.ts, alerts.ts, vehicles.ts   GTFS-realtime (Pittsburgh region only)
src/lib
  journey.ts            one journey builder for the map, the card and the voice
  today.ts              everything the Today screen needs
  store.ts              in-memory store, seeded per region
  learned.ts            one learned profile per student; every multiplier is 1 until earned
src/app/api             today, plan, proposals/[id], complete, import, email, transit/*, voice/*, eval, selfeval, ...
src/app                 Today, the map, the email modal
ios/Orbit               SwiftUI views against the same API; plays Orbit's voice from /api/voice/speak
scripts                 gtfs-extract-hudson, setup-voice-agent, tune-voice, tunnel (with watchdog), selfeval-loop
```

Invariants: only `/api/proposals/[id]` turns a proposal into an action; agents have no tool that books, sends or moves anything; XP is computed server-side and capped; friends' classes are never shared, only overlapping free windows; the voice tools return finished sentences so the model never computes a number; a Critic can lower trust in an agent but nothing automated can raise it.

## Run

```
cp .env.example .env.local        # keys optional; everything degrades to deterministic mode
npm install
npm test                          # 220 tests
npm run dev -- -p 3123            # http://localhost:3123
node scripts/tunnel.mjs 3123      # public URL for the ElevenLabs webhooks; re-points the tools itself
```

`ORBIT_REGION=hudson` (default) plans Jersey City to Stevens; `oakland` is Pittsburgh, kept because the transit regression tests are pinned to it. `DEMO_CLOCK=2026-09-22T11:10` pins the planning clock to a weekday for weekend judging. `node scripts/selfeval-loop.mjs` asks the question bank every ten minutes and writes the trend to `docs/selfeval.md`.

## The demo, five beats

1. **The ledger.** 13h 35m crossed out, 9h 07m real, the missing 268 minutes itemised.
2. **Plan my day.** The agent proposes one task per window; approve one and it lands.
3. **The train.** Tap through to the map: which light rail, from which stop, when to leave, and whether you make it.
4. **Voice.** "The problem set took ninety-five minutes." XP fires and the calibration multiplier moves on screen. Then: "When do I need to leave?" and "Why?"
5. **The eval.** Open `/eval`: a ten-line heuristic beat the model, the clamp fixed it, and what it learned about this student this week.

## Not done, said plainly

- `ANTHROPIC_API_KEY` is not set; the Day Agent runs Nemotron first and the deterministic plan second. `NVIDIA_API_KEY` is set; `/eval` is the judge's page for what Nemotron does and what it measured, and `docs/nvidia.md` is the write-up. Nothing was fine-tuned.
- The store is in memory and resets on restart. No transfers between lines, no Stevens shuttle, no rate limiting, no `GOOGLE_MAPS_API_KEY` (walks are straight-line estimates and marked as such).
- `ios/Orbit/Orbit.xcodeproj` builds on a Mac (XcodeGen, iOS 17, ElevenLabs Swift SDK); nobody on a Windows machine has compiled it, so treat it as coded rather than shipped.
- No model was fine-tuned. Every Nemotron job is the hosted model with a JSON schema; where it is "optimised" the optimisation is code (an anchor and a clamp), and `docs/eval.md` and `docs/learning/` show the numbers either way.

## Docs

`docs/nvidia.md` · `docs/transit.md` · `docs/voice.md` · `docs/selfeval.md` · `docs/eval.md` · `docs/email.md` · `docs/data-and-learning.md` · `docs/bus-map.md` · `docs/theme.md` · `docs/copy.md` · `docs/future-signals.md` · `DECISIONS.md` (append-only log of every decision and why)
