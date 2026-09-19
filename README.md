# Orbit

Your calendar says you have eleven free hours today. You have nine hours forty-nine minutes. Orbit counts the walk, the meal and the settling-in, finds the real gaps between classes, puts one thing in each, tells you when to stand up for the bus, and turns the whole day into quests you can only complete by actually doing them.

Built at SteelHacks XIII, Sept 19-20 2026. All code in this repository was started after 11:00 AM EST on Sept 19 2026. AI tools used: Claude (Anthropic) for scaffolding and code review, Claude Sonnet 5 at runtime as the day agent, NVIDIA Nemotron at runtime for task estimation, ElevenLabs for voice.

## Tracks

- NVIDIA "Beyond the Chatbot": Nemotron estimates task minutes and domains (not chat) and is evaluated against a synthetic session log at `/api/eval` (MAE, within-25% hit rate, latency, provider). Nemotron Parse (hosted) reads syllabus PDFs into deadlines with bounding-box provenance.
- ElevenLabs "Out Loud": a voice agent gives the morning briefing from the real ledger, takes the evening "how long did it really take" check-in that feeds the estimator, and switches modes by voice.
- LANXESS "Xtract": every imported deadline links back to its source (ICS uid or syllabus page and box).
- General.

## Architecture

```
src/core            pure, tested arithmetic (no framework, no network)
  time.ts           minutes-from-midnight, past-midnight bedtimes
  ledger.ts         awake - classes - travel - meals - routines = usable; cut suggestions
  gaps.ts           between-class holes with walk + settle removed, >= 25 min, one task per gap
  estimator.ts      guess vs actual per course, 5 samples, trimmed, capped 3x; title heuristics
  ics.ts            RFC 5545 reader: folding, TZID, RRULE weekly/daily, EXDATE, Canvas titles
  game.ts           XP that cannot be farmed, ring ratchet, weekly board, quests from real gaps
  overlap.ts        shared free windows with opted-in friends (classes never exposed)
  bus.ts            leave-by from gap end + walk + live arrivals; ghost-trip detection
src/agents
  models.ts         model registry: Nemotron via NVIDIA hosted API (id discovery, JSON-schema calls, heuristic fallback); Claude
  parse.ts          Nemotron Parse via the hosted API: page image -> markdown + bounding boxes
  syllabus.ts       parsed pages -> dated tasks; every task must quote the document verbatim or it is dropped
  estimate.ts       Nemotron's non-chat job: minutes + domain from a title, JSON-schema constrained
  dayAgent.ts       Claude with four tools; every tool is a PROPOSAL, humans approve in /api/proposals
  voice.ts          ElevenLabs token minting; briefing text built from the ledger
src/services/schedule.ts  PRT static timetable slice (data/prt-oakland.json): service days, departures per stop, ride times
src/services/prt.ts       PRT GTFS-realtime overlay (public trip updates), ghost detection, demo clock
src/lib/transit.ts        the two legs a commuter has: Home -> first class, last class -> Home
src/lib             in-memory store (swap for Postgres), today builder
src/app/api         today, plan, proposals/[id], complete, leaderboard, mode, voice/token, voice/tool, eval, syllabus, nvidia
src/app             Today screen
```

Invariants: only `/api/proposals/[id]` turns a proposal into an action; agents have no tool that books, sends or moves anything; XP is computed server-side from planned vs actual minutes and is capped; friends' classes are never shared, only overlapping free windows; every model call records which provider answered so degraded mode is visible.

## Transit data

Pittsburgh Regional Transit publishes its timetable (GTFS) and realtime trip updates openly under its Developer License Agreement. `scripts/gtfs-extract.mjs` downloads the current GTFS zip and writes the Oakland / Squirrel Hill slice to `data/prt-oakland.json` (10 stops, 16 routes, about 17,000 departures). At runtime the app reads that file for scheduled departures and overlays the live feed at `https://truetime.portauthority.org/gtfsrt-bus/trips` (cached 30 seconds). A trip that should already be on the road but is missing from the live feed is shown as a ghost. Set `DEMO_CLOCK=2026-09-22T13:10` to plan against a weekday timetable during weekend judging.

## Run

```
cp .env.example .env.local   # keys optional; everything degrades to deterministic demo mode
npm install
npm test                      # 15 tests, hand-computed fixture
npm run dev                   # http://localhost:3000
```

## Demo

1. Open Today. The ledger shows 9h 49m real vs 13h 35m claimed, two gaps, a bus leave-by time, friends free at the same time, and the Tower A board.
2. Plan my day. The agent proposes: move Problem Set 4 into the 11:05 gap, book a Hillman room, invite Sam and Priya. Approve one.
3. Mark the task done, enter the real minutes. XP appears with reasons; the MATH 0220 multiplier updates.
4. Switch to Crisis by voice or button. Non-coursework disappears, XP pauses, streak survives.
5. Overload the day (add a 400-minute task); the agent drafts the extension email with the ledger numbers in it. Approve to send.
6. `/api/eval` for the Nemotron vs heuristic table.
