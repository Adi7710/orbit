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

## 2026-09-19 14:26 ET · Jatin · Nemotron ids pinned
Decision: NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b (text, JSON schema, thinking off) and Parse stays on nvidia/nemotron-parse. nvidia/nemotron-parse-2.0 is not usable: without tools it has a 4096-token context and rejects a full page image, with tools it returns 400 (no auto tool choice).
Why: /api/nvidia lists 82 models for our key; the chosen text id is what the model page recommends and supports structured output. /api/eval returns provider nemotron-hosted with real latency.
Affects: .env.local (not committed), src/agents/models.ts (no change needed; chat_template_kwargs is accepted).

## 2026-09-19 14:26 ET · Jatin · First honest /api/eval: Nemotron is worse than the heuristic
Decision: Keep the eval as is and report the result. On 10 synthetic sessions Nemotron MAE was 35.3 min (within 25%: 8/10, avg latency 7.6 s, one call timed out at 30 s and fell back to the heuristic) against the heuristic's MAE 16.3 (9/10). Worst miss: "Quiz 3 prep" estimated 240 min against 50 actual.
Why: This is the "failure we found" for the NVIDIA track and for docs/eval.md; hiding it would make the eval worthless. It is also the case for the Brev fine-tune (#5) and for clamping estimates to the per-course calibration.
Affects: src/agents/estimate.ts (Adi), issue #5, docs/eval.md.

## 2026-09-19 14:30 ET · Jatin · Nemotron Parse response shape and a synthetic syllabus sample
Decision: Added data/samples/cs0441-syllabus-p1.{png,txt}, a synthetic one-page syllabus rendered at 1700x2200, for testing /api/syllabus and the upload panel. The Parse response shape is documented in issue #6: tool_calls[0].function.arguments is a JSON array of arrays (one inner array per image), each element {type, text, bbox:{xmin,ymin,xmax,ymax}} with bbox normalized 0-1, tables as LaTeX tabular text, checkbox glyphs dropped. parse.ts normalize() reads the outer array as elements and yields one empty element; the fix is to flatten one level.
Why: A 612x792 render returned an empty page and hid the shape problem; the higher resolution shows the real output. The verbatim-quote guard already rejected an invented "Syllabus Quiz" task.
Affects: src/agents/parse.ts and syllabus.ts (Adi), web syllabus panel (#9: scale boxes by image size).

## 2026-09-19 14:30 ET · lead Claude · The upper-campus dorm trip is a walk, not a bus
Decision: Added stops 8650 (Allequippa + Sutherland / Petersen Center), 18894, 9028 (DeSoto + OHara) and 22747 (Fifth at Robinson) plus routes 81 and 83 to the schedule slice, then checked the trips: PRT runs 28 weekday trips campus -> Sutherland and ZERO Sutherland -> campus (the 83 loops up the hill then heads to Downtown via the Hill District). So the demo commute is where-you-live -> class, with Home defaulting to Squirrel Hill (Murray + Darlington). Upper-campus dorm residents walk down or take Pitt's own shuttle, which is not in PRT's feed.
Why: Better to state a real limitation than fake a route. It is also a good line for the pitch: we checked the data instead of assuming.
Affects: scripts/gtfs-extract.mjs, data/prt-oakland.json (14 stops, 20 shapes, 20,079 departures), docs/bus-map.md.

## 2026-09-19 14:35 ET · lead Claude · Web map uses Leaflet + CARTO tiles; iOS uses MapKit; Google Maps optional
Decision: Added `leaflet` (npm) for the web map at /map with CARTO Voyager raster tiles (OpenStreetMap data, no key). iOS uses MapKit (no key, no billing). Google Maps stays optional and only changes tile look and the walking-leg source.
Why: Zero keys, zero billing, works offline-ish for judging; one contract feeds both clients.
Affects: package.json, src/app/map/*, ios/Orbit/*.

## 2026-09-19 14:50 ET · lead Claude · Voice agent: the server writes the sentence, the model delivers it
Decision: Every voice tool returns a finished spoken sentence in a `text` field, composed server-side from the deterministic core. The ElevenLabs agent reads it verbatim and never computes a number. Tier 1 tools: get_today, log_actual, set_mode, get_bus. Voice may approve only move_task and book_room proposals; draft_extension and notify_friends require a tap because they reach another person. Full plan in docs/voice.md.
Why: A voice agent that generates numbers will eventually say a wrong XP total or bus time out loud, which is worse than a wrong pixel. This makes hallucinated facts structurally impossible and keeps the LLM to intent recognition only.
Affects: src/app/api/voice/tool/route.ts, src/agents/voice.ts, issue #7, #8, TodayClient mic button, ios voice button.

## 2026-09-19 14:50 ET · lead Claude · Voice needs a public URL before anything else
Decision: ElevenLabs server tools call our webhook from their cloud, so localhost cannot work. Deploying to Vercel (or an ngrok tunnel) is step 1 of the voice build and blocks steps 2 through 6. The agent's LLM is ElevenLabs' native Claude Sonnet 5, billed from ElevenLabs credits, so voice does not spend our $25 Anthropic budget.
Why: This is the step teams discover three hours in.
Affects: issue #7, deployment, .env.local.

## 2026-09-19 15:10 ET · Adi + lead Claude · Anchor Nemotron to the heuristic instead of trusting it
Decision: estimateTask gains two variants. "zeroshot" keeps the original prompt unchanged so the failure Jatin measured stays reproducible. "anchored" passes the heuristic estimate as a baseline, tells the model to adjust only where the title is informative, and clamps the result in code to [0.5x, 2x] of that baseline. /api/eval now runs heuristic, zeroshot and anchored in parallel and reports MAE, within-25%, worst miss, latency, clamp-fired count and which provider answered. Written up in docs/eval.md.
Why: The 240-vs-50 miss on "Quiz 3 prep" was our prompt, not the model: the bands named exam prep and never mentioned quizzes. Anchoring makes a 5x miss structurally impossible instead of merely discouraged, and keeps the model useful for the cold start before per-course calibration has five real sessions.
Affects: src/agents/estimate.ts, src/app/api/eval/route.ts, docs/eval.md, issue #5 (the fine-tune now has a baseline to beat).

## 2026-09-19 15:10 ET · Adi + lead Claude · A timeout is not a schema rejection
Decision: nemotronJson retries without the JSON schema only when the endpoint rejected the schema. On an abort or timeout it falls back immediately.
Why: Both attempts had their own 15 s budget, so a slow endpoint cost 30 s for the same answer. That is the worst case Jatin saw.
Affects: src/agents/models.ts.

## 2026-09-19 15:10 ET · Adi + lead Claude · Parse boxes are normalized 0..1 and the payload is an array of arrays
Decision: normalize() in parse.ts flattens one level and drops empty-text elements; ParsedElement.bbox stays [xmin, ymin, xmax, ymax] normalized 0..1, documented in the type. Clients multiply by the rendered image size. Tests in src/core/__tests__/parse.test.ts pin the recorded shape, including the malformed and markdown-only paths.
Why: Reading the outer array as the element list yielded one empty element and lost every box (#6). Keeping 0..1 means the same numbers work for the web panel, the iOS overlay and any render resolution.
Affects: src/agents/parse.ts, src/agents/syllabus.ts, web syllabus panel (#9), iOS overlay.

## 2026-09-19 15:05 ET · Jatin · ICS import route, sample calendars, zone-aware day matching
Decision: Added POST /api/import taking `{ timetableUrl?, canvasUrl?, ics?, canvasIcs?, sample?, day?, horizonDays? }` and answering `{ ok, day, timetable?, canvas?, warnings, errors }`. The timetable replaces today's fixed blocks; Canvas items become tasks upserted by ICS uid (importing twice changes nothing, completedAt is kept) and replace a seeded placeholder with the same course and title. Only Canvas items due from today through `horizonDays` (default 14) are imported. "Today" is the planning clock's day (DEMO_CLOCK when pinned), `day` overrides it. A pasted or fetched text without BEGIN:VCALENDAR is rejected and changes nothing. New data/pitt-tuesday.ics and data/canvas-sample.ics are synthetic; the timetable reproduces the fixture Tuesday exactly (usable 589 min, gaps 11:05-14:21 and 15:50-23:44) and a test pins it. Today panel gets two URL fields, an Import button and "Use sample data".
Why: Students paste two links and the demo must also work with no network. Importing twice must be safe because judges will click twice.
Affects: src/app/api/import/route.ts, src/app/TodayClient.tsx, data/*.ics, next.config.ts (outputFileTracingIncludes so the .ics files ship to Vercel). No existing response shape changed; iOS needs nothing.

## 2026-09-19 15:05 ET · Jatin · occursOn, blocksOn and taskFromEvent take an optional zone
Decision: src/core/ics.ts compares calendar days in an optional IANA zone (default: server-local, so old callers behave as before). The import passes America/New_York. Date-only Canvas items are due 23:59 in that zone. EXDATE now keeps its TZID.
Why: Vercel runs in UTC. A 20:00 New York class is already tomorrow in UTC, so the old server-local comparison would put evening classes and date-only due dates on the wrong day in production. The arithmetic for existing callers is unchanged; a test covers the evening case.
Affects: src/core/ics.ts, src/core/__tests__/import.test.ts. Lead's tests unchanged and green.

## 2026-09-19 15:05 ET · Jatin · Server-side fetch of pasted calendar links is restricted
Decision: fetchIcs (src/services/ics.ts) accepts public https links only (webcal is rewritten to https), refuses localhost, .local, .internal, private/loopback/link-local ranges, credentials in the URL, more than 3 redirects (each re-checked), bodies over 3 MB and requests over 10 s. Known gap: DNS is resolved once for the check and again by fetch, so a hostile DNS server could rebind in between; fine for synthetic demo data, pin the resolved address before any real deployment.
Why: The URL is user input fetched from our own network, so without this the endpoint is a server-side request forgery hole on a public deployment.
Affects: src/services/ics.ts, /api/import.

## 2026-09-19 15:05 ET · Jatin · Deferred: commute mode and home from the setup form
Decision: The import does not yet set commute mode or home. TravelGraph's mode does not change any leg arithmetic today and transit is keyed on the place "Home", so accepting the fields would be decoration. Unknown buildings use the graph's 10-minute fallback.
Why: The lead's note asked for it; doing it properly means a core change that needs the lead's call.
Affects: src/core/travel.ts, src/lib/transit.ts. Raised on issue #2.
