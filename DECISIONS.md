# Decisions

Append-only. Every Claude session and every human adds a line for each non-trivial decision. Newest at the bottom. Format:

```
## YYYY-MM-DD HH:MM ET · who · short title
Decision: what was decided.
Why: the reason, in one or two sentences.
Affects: files, routes, or other people's work.
```

## 2026-09-19 13:00 ET · Adi + lead Claude · Rebuild Orbit in TypeScript, web-first
Decision: Orbit is rebuilt from scratch as a Next.js app with a pure TypeScript core; the earlier Swift package is not used.
Why: SteelHacks rules disqualify code written before 11 AM Sept 19; the design is reused, the code is not. Web lets all four people build; iOS is a client on top.
Affects: everything.

## 2026-09-19 13:10 ET · lead Claude · Agents propose, humans approve
Decision: Every agent tool call becomes a pending proposal; only /api/proposals/[id] executes after a human tap.
Why: Winning hackathon agents (LEGR, Citadail) shipped approval gates; it is also the honest answer to "what could go wrong".
Affects: src/agents/dayAgent.ts, src/app/api/proposals, iOS approve screen.

## 2026-09-19 13:15 ET · lead Claude · XP cannot be farmed
Decision: XP is awarded server-side only for planned minutes actually worked, scaled by estimate honesty, capped per task (150) and per day (400); zero XP in crisis and chill, streaks never break.
Why: A leaderboard that can be gamed by creating tasks is worthless within a day.
Affects: src/core/game.ts, /api/complete, leaderboard UI.

## 2026-09-19 13:30 ET · Adi · Hosted Nemotron only
Decision: All Nemotron calls go through NVIDIA's hosted API (build.nvidia.com); no local models on any laptop.
Why: NVIDIA provided API access; team laptops have no NVIDIA GPUs.
Affects: src/agents/models.ts, parse.ts, .env.example.

## 2026-09-19 13:45 ET · Adi · Credits budget
Decision: Claude $25 for the Day Agent only (prompt caching on, spend tracker on /api/plan); Brev $60 reserved for one time-boxed Nemotron Nano fine-tune (stop instance after); Vercel $30 for deploy and Blob; ElevenLabs Creator month for the voice agent with cached morning briefing audio.
Why: Prevent any single loop or idle GPU from consuming the budget before judging.
Affects: src/agents/dayAgent.ts, issue #5.

## 2026-09-19 13:50 ET · Adi · Roles
Decision: Adi = agents; Akshat = ideation, theme, gamification economy, pitch; Anmol = iOS app; Jatin = features and infra.
Why: Matches machines (Mac for iOS), skills, and who proposed what.
Affects: prompts/, GitHub issue assignments.

## 2026-09-19 14:00 ET · lead Claude · Bus routing runs on PRT's real timetable with the public realtime overlay
Decision: data/prt-oakland.json is a 2.4 MB slice of PRT's static GTFS (feed Merged_Clever_2606_2, valid 2026-06-28 to 2026-10-14) for 10 stops: campus outbound (31 Forbes+Bigelow, 20959 Forbes+Bouquet, 29, 2568), campus inbound (34 Fifth+University, 35 Fifth+Thackeray, 33, 1171), and Squirrel Hill (7095 Forbes+Shady inbound, 7126 Forbes+Murray outbound), routes 61A-D, 71A-D, P3, 75, 67, 69, 58, 93, 54, 28X. Regenerate with `node scripts/gtfs-extract.mjs`. Realtime trip updates come from https://truetime.portauthority.org/gtfsrt-bus/trips (public, protobuf, no key), cached 30 s, and are matched to scheduled trips by trip_id and stop_id.
Why: Both feeds are open (verified today); a real timetable beats a fake snapshot and the live delay is the demo moment ("61B is 5 minutes late, leave at 14:02").
Affects: src/services/schedule.ts, src/services/prt.ts, src/lib/transit.ts, src/lib/today.ts (bus, arrivals, ghosts, transit fields), TodayClient bus card, iOS models for `bus` and `transit`.

## 2026-09-19 14:00 ET · lead Claude · Ghost definition and demo clock
Decision: A "ghost" is a scheduled trip whose first stop departed more than 3 minutes ago with no trip update on the feed; a trip that has not started is "scheduled", not a ghost. DEMO_CLOCK (e.g. 2026-09-22T13:10) pins the planning clock to a weekday so Sunday judging shows a weekday timetable; when pinned, realtime is skipped and everything is labeled "demo clock".
Why: Realtime feeds only carry active trips, so unstarted trips must not be flagged. Sunday service is sparse and would make the demo look empty.
Affects: src/services/prt.ts, .env.example, README.

## 2026-09-19 14:05 ET · lead Claude · Home is Squirrel Hill for the bus legs; the fixture's walking graph is campus-only
Decision: PLACES maps Home to the Squirrel Hill stops for the two bus legs (morning Home→first class, evening last class→Home). The ledger's travel graph keeps the hand-computed walking legs between campus buildings; the "walk home" default in the fixture is a placeholder until the import route replaces it with the student's real commute mode.
Why: Keeps the tested ledger numbers stable while the bus feature uses real stops. Jatin's ICS import (#2) should set commute mode and home from the setup form.
Affects: src/lib/transit.ts, src/core/__tests__/fixture.ts, issue #2.

## 2026-09-19 14:20 ET · lead Claude · Bus map is rendering-only; all timing comes from /api/transit/journey
Decision: New endpoint GET /api/transit/journey returns origin, board/alight stops, walk legs (Google Routes API walking when GOOGLE_MAPS_API_KEY is set, else 1.3x straight-line at 80 m/min), the next four buses sorted by actual departure with PRT live predictions, the live vehicle position (from the public vehicles feed, matched by trip id; about 160 of 250 buses report one), distance to the stop measured along the route polyline, ride time from the timetable, arrival at the destination, and a verdict against the class start. Route shapes for 61A-D and 71A-D are in data/prt-oakland.json (thinned to every 4th point). Design and contract in docs/bus-map.md.
Why: The map must never recompute times; one source of truth keeps iOS and web identical and testable. MapKit is the default on iOS (no key); Google Maps is optional and changes only the walk source and tiles.
Affects: src/lib/journey.ts, src/services/vehicles.ts, src/core/geo.ts, schedule.ts (routeShape, routeColor), issue #21 (Anmol), #13.
