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

## 2026-09-19 15:40 ET · lead Claude · Public URL without waiting on anyone
Decision: Installed cloudflared and ran a quick tunnel to the dev server, which needs no account and no signup. Public URL is in .tunnel-url.txt (gitignored) and posted in issue #23. This unblocks ElevenLabs webhooks, Anmol's simulator (ORBIT_API_BASE) and anyone who wants to see the app. Vercel is still the Sunday-morning answer because a tunnel dies when the laptop sleeps.
Why: The webhook URL was blocking the entire voice build and was waiting on a human to log into Vercel. A leader should not park the critical path behind someone else's browser session.
Affects: issue #7, #21, #23, .gitignore.

## 2026-09-19 15:45 ET · lead Claude · DEMO_CLOCK is off by default; it disables live buses by design
Decision: DEMO_CLOCK is now commented out in .env.example and .env.local, with a warning that setting it pins a simulated weekday and DISABLES the realtime overlay, because a simulated time cannot be matched against a live feed. It stays only as an escape hatch if PRT's feed is down at demo time.
Why: I shipped it ON in the template. Copying the template froze the app to Tuesday 13:10 and silently turned off live buses, which is the single best moment in the demo. Caught by noticing the app reported "live feed down" while a direct fetch showed 225 trip updates and 30 live 61x buses. Sunday service on the 61s is frequent enough that the live feed is the right default for judging.
Affects: .env.example, .env.local, docs/bus-map.md, demo rehearsals.

## 2026-09-19 15:50 ET · lead Claude · Voice tools compose finished sentences, including how numbers are said
Decision: src/agents/voiceTools.ts holds the four tier-1 tools and composes every reply as a finished spoken sentence: spoken() for integers, spokenDuration() for "nine hours forty-nine", spokenClock() for "eleven oh five", speakReason() for XP reasons written for the eye, and asSentence() to capitalize every sentence. resolveTask() maps "the problem set" to the right task by exact, substring then token overlap, and asks rather than guessing when two match equally. /api/reset restores the opening state so the demo can be rehearsed repeatedly.
Why: TTS mangles bare digits, and a voice agent that invents a number is worse than a wrong pixel. Composing server-side keeps the model to intent recognition only.
Affects: src/agents/voiceTools.ts, src/app/api/voice/tool/route.ts, src/app/api/reset/route.ts, issue #7.

## 2026-09-19 15:55 ET · lead Claude · The ledger is a reveal, not a statistic
Decision: LedgerReveal animates the calendar's number down to the real one while each deduction lands underneath, with a replay button, honoring prefers-reduced-motion. It only reveals numbers already computed and tested in src/core/ledger.ts, so a broken animation can never change a number.
Why: Beat one of the demo has to be felt, not read. The 226 missing minutes are the one thing in this product nobody has seen about their own life.
Affects: src/app/LedgerReveal.tsx, src/app/TodayClient.tsx, docs/pitch.md (Akshat).

## 2026-09-19 16:05 ET · lead Claude · One bus engine for both screens; the card deep-links into the map
Decision: Deleted src/lib/transit.ts (planLeg, PLACES). buildToday() now calls the same buildJourney() the map uses, picks the leg that matters right now (to the next class, else home after the last one), and returns verdict, live status, vehicle distance, walk and ride legs, plus a mapHref. /map reads from, to and arriveBy from the query string and keeps them in the URL, so the Today card opens the map on the exact journey it was showing. Verified: both report leave-by 15:48 for the same leg.
Why: Two code paths computing the same time is how a demo shows 14:02 on one screen and 14:07 on the next. One engine, two renderings.
Affects: src/lib/today.ts, src/lib/journey.ts, src/app/TodayClient.tsx, src/app/map/*, iOS `bus` model (new fields: status, verdict, classAtText, vehicleKm, walkToDest, mapHref).

## 2026-09-19 16:05 ET · lead Claude · Tunnel is supervised, and its URL is not stable
Decision: scripts/tunnel.mjs supervises cloudflared, writes the live URL to .tunnel-url.txt and restarts on death. Current URL: https://drama-times-screens-valley.trycloudflare.com
Why: The first quick tunnel was revoked by Cloudflare after about an hour ("Tunnel not found") and the team's URL went dead silently. Quick tunnels are fine for browsing and for the iOS simulator, but the ElevenLabs webhook must be re-pasted whenever the URL changes, so Vercel is still required before the voice agent is wired for real.
Affects: scripts/tunnel.mjs, issue #7, #21, #23.

## 2026-09-19 16:00 ET · Jatin · Habit patterns: code measures, Nemotron words, code verifies
Decision: Added a habit log and a "Your patterns" card. src/core/habits.ts (pure, tested against a hand-computed dataset) measures from completed sessions: pace by time of day (a session's actual/estimate ratio divided by the student's own average for that kind of task, so a bucket full of easy tasks is not called fast), overrun by domain, how many hours before the deadline they finish, and the share done inside planned gaps. A window is only named when both buckets have >= 3 sessions and differ by >= 0.15 pace. src/agents/habitAgent.ts gives Nemotron (hosted, JSON schema) those numbers plus the sentences code would write and asks for friendlier wording with the stat keys cited. Code then verifies every insight (evidence matches the real profile; every number in the text is one of the cited values or its percent form); a failing insight is replaced by the code's own sentence, and the reason is returned in `rejections`. Nemotron never sees raw history and never does arithmetic. GET /api/habits (`?source=rules` skips the model) is read-only and additive, so no existing response shape changed. The card shows the code version instantly and swaps in Nemotron's wording when it arrives.
Why: The first eval showed Nemotron is worse than a heuristic at guessing minutes from a title; reading measured history and explaining it is a better use of it, and it stays honest because a made-up habit cannot pass verification. The habit numbers also give a measurable eval (habit-aware vs plain estimates) for the NVIDIA track.
Affects: src/core/habits.ts, src/core/habitSeed.ts, src/agents/habitAgent.ts, src/app/api/habits/route.ts, src/app/HabitsCard.tsx, one line in TodayClient.tsx, store.ts (new `habits` field), /api/complete (appends a record). Habit history does not feed the estimator or the ledger yet, so the pinned numbers are unchanged.

## 2026-09-19 16:00 ET · Jatin · Seeded habit history is synthetic and says so
Decision: syntheticHistory() seeds 33 sessions over 21 days with planted patterns (reading 0.8x before noon and 1.3x in the evening, graded work 1.2x / 1.5x / 1.9x by time of day, finished 2-8 hours before due). Every seeded row has synthetic: true, and the card says "demo history" while more than half the rows are synthetic. Real completions append and dilute it.
Why: On demo day there is no real history; the patterns are planted so the tests can check the math finds a known answer. Presenting them as the student's real habits would be dishonest.
Affects: src/core/habitSeed.ts, HabitsCard.

## 2026-09-19 16:00 ET · Jatin · Observed Nemotron behaviour on the habit prompt
Decision: The habit call uses a 20 s timeout and the code-written insights as fallback. Measured on hosted Nemotron: 7.6-13.6 s for a 3-insight answer, and two of three cold calls timed out. The prompt requires the stat key behind every number to be cited: without that rule the model wrote a correct "21% faster" but cited only the bucket names and the verifier (correctly) refused it.
Why: Hosted latency is spiky (same 15 s tail as the eval). The UI must never wait on it, and an ungrounded percentage should not pass just because it happens to be right.
Affects: src/agents/habitAgent.ts prompt, /api/habits cache (per profile, so a new completion re-words), issue for the Brev fine-tune (#5).

## 2026-09-19 16:20 ET · Jatin · No "Your patterns" card; habits become an agent, not a screen
Decision: Removed HabitsCard and its line in TodayClient. The pure habit math (src/core/habits.ts), the seeded synthetic history, the verifier and /api/habits stay as the foundation for a weekly learning agent that adjusts the app's estimates from a student's history; nothing about habits is shown as a card.
Why: The owner wants the learning to happen inside the app's planning and voice agent, not as a report the student reads.
Affects: src/app/TodayClient.tsx (back to main's version), issue/PR #25.

## 2026-09-19 16:45 ET · lead Claude · The Watcher: the day re-plans itself when reality changes
Decision: New agent in src/agents/watcher.ts. It snapshots the day every tick, diffs against the last snapshot, and reacts to what actually changed: a class removed, a window opening / growing / shrinking / closing, the live bus slipping, the day stopping or starting to fit, a deadline inside 24 hours with nowhere to happen. Two tiers, enforced in code. Tier A acts alone (re-pick what goes in a window, move the leave-by, suggest a cut) because it is reversible and touches only your own screen. Tier B only ever queues a proposal (hold a room, message a friend, draft an extension) because it reaches outside the app. It never completes work, never awards XP, never sends anything. Every decision appends to a trace with the evidence that triggered it, the action and the reasoning, and it can be paused or killed in one click. /api/watcher ticks and controls it; /api/demo changes the world (cancel a class, overload the day) so it has something real to react to, and never fakes the reaction.
Why: Everything else in Orbit answered a question when asked, which is a button, not an agent. The projects that won this year (LEGR, Citadail, AgentZero) all ran over time, kept a reasoning trace and had a kill switch. This also creates the demo moment: a judge cancels a class and watches the afternoon reorganise itself, with a reason for every move.
Affects: src/agents/watcher.ts, src/app/api/watcher, src/app/api/demo, src/app/WatcherPanel.tsx, TodayClient, docs/pitch.md (Akshat), iOS (a later screen could show the same trace).

## 2026-09-19 16:45 ET · lead Claude · Windows are identified by when they start, not by their position
Decision: findGaps now ids a window as `g<startMinute>` instead of `gap-<index>`. Tests pin it.
Why: Positional ids silently re-label a different window whenever a class is added or cancelled, so the Watcher's first run reported "your window lost 111 minutes" when in truth an earlier window had appeared and everything shifted down one. A diff between two versions of the day is meaningless unless identity is stable. Found by running the cancel-a-class scenario and reading the output rather than trusting it.
Affects: src/core/gaps.ts, src/agents/watcher.ts, quest ids.

## 2026-09-19 17:15 ET · Adi + lead Claude · The voice agent is created from a script, not from clicks
Decision: scripts/setup-voice-agent.mjs creates the four tools and the agent through the ElevenLabs API and writes ELEVENLABS_AGENT_ID back into .env.local. Re-running replaces rather than duplicating. Each tool has its own URL carrying its name (/api/voice/tool?tool=log_actual) so the model supplies arguments only and cannot select the wrong tool. Agent runs claude-sonnet-4-5 with eleven_flash_v2; English agents are restricted to the turbo/flash v2 families, which is what the first three attempts were actually failing on.
Why: The webhook URL changes whenever the tunnel rotates, so pointing the tools at a new URL has to be one command, not a dozen clicks someone has to remember at 3 a.m.
Affects: scripts/setup-voice-agent.mjs, src/app/api/voice/tool/route.ts, .env.local.

## 2026-09-19 17:15 ET · lead Claude · Rotated the webhook secret after it appeared in an API error
Decision: VOICE_TOOL_SECRET regenerated and the tools recreated with the new value.
Why: ElevenLabs echoed the request headers back in a 422 validation error, so the old secret was printed to the terminal. It only guards our own webhook and never left this machine, but rotating costs one command.
Affects: .env.local, the four registered tools.

## 2026-09-19 17:35 ET · lead Claude · Pin the app to a light surface; never let a failed fetch hang the screen
Decision: globals.css no longer flips the background to near-black under prefers-color-scheme: dark, and sets color-scheme: light. TodayClient fetches the day and the leaderboard independently, each with a 20 s timeout, and renders a visible error with a Try again button instead of sitting on "Loading your day…".
Why: Every card is dark text on paper, so the starter template's dark background rendered the entire app invisible on a machine set to dark mode, which looks exactly like a hang. Separately, the original single Promise.all had no catch, so any one failing request left the screen loading forever with nothing on screen and nothing in the console for a judge to see. A real dark theme belongs in docs/theme.md, not in a panic at 5 p.m.
Affects: src/app/globals.css, src/app/TodayClient.tsx.

## 2026-09-19 17:35 ET · lead Claude · Browse on localhost; the tunnel is for ElevenLabs
Decision: Use http://localhost:3123 for looking at the app and for the demo. The public tunnel exists so ElevenLabs' cloud can reach our webhook, and so teammates and the iOS simulator have an address.
Why: Next.js in dev ships large uncompiled chunks and an HMR websocket; pushing all of that through a quick tunnel is slow and flaky, while the same page is instant locally. Measured: /api/today is 25 ms locally and 1.1 s through the tunnel.
Affects: how we demo, issue #23.

## 2026-09-19 18:05 ET · Adi + lead Claude · The Critic: a second model grades every agent decision before anyone sees it
Decision: src/agents/critic.ts scores each Watcher decision on four dimensions (grounded, tierCorrect, useful, voice) with a JSON-schema call to Nemotron, and a deterministic rubric when no model is reachable. Weighted overall score decides a verdict: keep, demote (a proposal becomes a silent note) or suppress (never reaches the student, but stays in the trace so the failure is visible). Scores accumulate per decision kind into a reward ledger at /api/critic; a kind averaging below 2.5 over at least 3 samples is muted and stops being allowed to interrupt. Shown in the Watcher panel as a score badge per entry plus an expandable table of how each behaviour is scoring.
Why: An agent that watches your day and acts on its own needs something between it and the user. Two properties make this real rather than decorative. First, the Critic can only ever lower trust: it can suppress or demote, never approve, never promote a Tier B proposal into a Tier A action, so a broken judge makes Orbit quieter rather than bolder. Second, it runs on Nemotron, so grading every decision costs nothing from the $25 Claude budget and is a third non-chat job for the NVIDIA track. The reward ledger is the part with teeth: a behaviour that keeps scoring badly loses the right to interrupt.
Affects: src/agents/critic.ts, src/agents/watcher.ts, src/app/api/critic, src/app/WatcherPanel.tsx, docs/eval.md.

## 2026-09-19 18:05 ET · lead Claude · Two bugs the Critic work surfaced
Decision: The deterministic rubric no longer treats clock times as unsupported quantity claims (11:05 was being read as an invented "11"), and /api/demo restore is idempotent so putting a class back after a reset cannot add a second copy.
Why: Both were found by running the loop and reading the output rather than trusting the tests.
Affects: src/agents/critic.ts, src/app/api/demo/route.ts.

## 2026-09-19 18:30 ET · Jatin · Nemotron connects to the voice agent as the brain behind two tools, not as the voice model
Decision: Added voice tools `get_estimate` ("how long will the problem set take me") and `get_coach` ("how am I doing", "when do I work best"), and made `log_actual` by voice append to the same learning log as a tap (shared `recordHabit`). Sentences are still written by the server; insight text is Nemotron-worded and code-verified, and every number is converted to words for speech (`speakNumbers`). The voice path never waits for the model: `get_coach` answers from the cache (or code-written sentences on a cold cache) and warms the model in the background, so the next ask speaks Nemotron's wording. Nemotron is NOT set as the ElevenLabs agent's LLM.
Why: The voice loop budget is 1-2 s a turn and hosted Nemotron measured 1-18 s per call, so as the conversation model it would make the agent feel broken; as a background analyst behind server tools it costs the voice turn nothing. Voice is also the best source of actual minutes, so routing it into the learning log is what the learning needs.
Affects: src/agents/voiceTools.ts, src/agents/habitAgent.ts (shared cache), src/lib/habitLog.ts, /api/complete, /api/habits, scripts/setup-voice-agent.mjs (two tools and two prompt lines). The ElevenLabs agent must be re-created by re-running the setup script (Adi's key and tunnel URL) before it can call the new tools.

## 2026-09-19 19:20 ET · Jatin · Weekly learning loop, first optimization: assignment time
Decision: Built the weekly learning loop and evaluated its first optimization. `src/core/student.ts` generates a synthetic student (8 weeks: assignments, readings, labs, exam studying, walking, settle-in and meals, procrastination lead times) with hidden true traits; `src/core/learning.ts` (pure) measures actual/estimate per kind of work each week and proposes shrunk, clamped multipliers; `src/agents/learner.ts` has hosted Nemotron choose adopt, step or hold per kind and write short notes, while code computes every number, refuses changes with under 2 sessions, and verifies each note (numbers, direction, code-computed trend, weeks vs sessions); `GET /api/learning/experiment` replays the student week by week against no learning, the current Estimator, a rules learner and the Nemotron learner. Results are in docs/learning/01-assignments.md. Nothing is wired into live planning yet; that waits for the owner's approval.
Why: The owner wants the app to learn each student's real pace weekly and plan better next week, one optimization at a time, with a test and a result. Hosted Nemotron cannot be retrained weekly, so the learned profile (multipliers plus Nemotron's notes as memory) is what carries learning forward; weight fine-tuning stays the separate Brev job (#5).
Affects: src/core/{learning,student,prng}.ts, src/agents/{learner,learningExperiment}.ts, src/app/api/learning/experiment, docs/learning/. `nemotronJson` gained an optional `maxTokens` (default 512, so no other caller changes). HabitRecord gained optional `week` and `startedHoursBeforeDue`.

## 2026-09-19 19:20 ET · Jatin · Finding: for assignment time, rules match or beat Nemotron; Nemotron's value is the notes
Decision: For the assignment optimization the deciding is left to code in the design's default path, and Nemotron is used for the notes (what the student and the voice agent read), not the numbers. Measured: mean error 6.3 (rules) vs 6.3 (Nemotron) for Maya and 6.5 vs 7.2 for Jordan; Nemotron timed out in 3 of 8 weeks for Maya even at 90 s.
Why: An honest result. A multiplicative correction does not need a model to decide it; Nemotron is more likely to earn its place on aspects where the structure is not known in advance (procrastination triggers, exam-study spacing). Its notes also proved unreliable without code checks: 10 of 18 notes for the held-out student cited a wrong trend, direction or count.
Affects: the choice of the next optimization; not yet reflected in the reviewer's default (both paths remain; `useModel` selects).

## 2026-09-19 20:30 ET · Jatin · The weekly learner is incremental: one week in, Nemotron produces next week's numbers
Decision: Added src/agents/weeklyLearner.ts, where Nemotron sees one week only (never the history), sees what it itself planned against what the work took, carries its own memory (its multipliers plus a memo to its future self), and produces the multiplier. Code only clamps to 0.4-3.0. Only the aspect under test is shown to it. The experiment gained arms weekly-rules (running average, same one-week window, no model) and weekly-nemotron, and a `trace` report showing week by week what it saw, changed and wrote. The earlier cumulative reviewer in learner.ts stays as the comparison arm.
Why: The owner's test is "does Nemotron learn something from one week's pattern and change the second week". The cumulative design could not answer it: code computed the correction from all of history and the model only voted, which is exactly why plain rules matched it. Scoring a week with the plan the learner held before that week is what makes the answer honest.
Affects: src/agents/weeklyLearner.ts, learningExperiment.ts, /api/learning/experiment, docs/learning/01-assignments.md.

## 2026-09-19 20:30 ET · Jatin · Aspect 1 passes: Nemotron learns assignment length from one week and beats a running average
Decision: Assignment time is done and measured. Mean plan error over weeks 2-8: Maya 21.1 (no learning) / 14.8 (app today) / 6.8 (running average) / 3.9 (Nemotron); held-out Jordan 29.7 / 20.0 / 8.5 / 6.7. After week 1 alone Nemotron chose 1.34, 1.07, 1.14 against a hidden truth of 1.33, 1.05, 1.20 (Maya) and 1.58, 1.22, 0.90 against 1.60, 1.20, 0.95 (Jordan). Week 2 error 15.0 -> 2.7 and 18.0 -> 6.7. Latency 1.2-22.6 s, no timeouts.
Why: This is the first aspect of the owner's list and the gate for moving to the next one. It is also the first job where Nemotron beats the code baseline rather than matching it.
Affects: docs/learning/01-assignments.md. Still offline: the learned multipliers are not wired into live planning, pending the owner's approval.

## 2026-09-19 20:30 ET · Jatin · Three prompt rules were needed before the model could learn at all
Decision: The weekly prompt now hands the model the per-kind ratio (it may not do the arithmetic), forbids lowering a multiplier while plans are still coming in short, and forbids contradicting its own memo.
Why: The first live run flattened every kind of work to 1.1 and then oscillated 1.1 -> 1.0 -> 1.1 for eight weeks while its memo said "consistently underestimates" (mean error 15.0, barely better than no learning). Each rule maps to one observed failure. After them the model beat the running average on both students.
Affects: src/agents/weeklyLearner.ts SYSTEM prompt. The same lesson applies to the next aspects: give the model the arithmetic, keep the judgement.

## 2026-09-19 21:40 ET · Jatin · One weekly learner serves every aspect
Decision: Generalized src/agents/weeklyLearner.ts from task kinds to an `AspectSpec` plus generic `Observation { label, category, estimate, actual }`. An aspect supplies its nouns, its categories and a two-sentence brief; only that aspect's records are ever shown to the model. The experiment is now aspect-driven (`observationsByWeek`) and both aspects share the arms, the scoring and the week-by-week trace.
Why: The owner wants aspects done one at a time, and each was going to need the same machinery. Generalizing after the second aspect (rather than guessing up front) meant the shape was known. Aspects 3 and 4 now cost an ASPECTS entry and a data mapping.
Affects: weeklyLearner.ts, learningExperiment.ts, weeklyLearner.test.ts. The synthetic student's walks gained per-leg difficulty and their own PRNG stream so that changing them cannot shift the task sessions and the aspect-1 numbers stay reproducible.

## 2026-09-19 21:40 ET · Jatin · Aspect 2 (walking speed): Nemotron learns it but does not earn its place; use the travel graph plus a buffer
Decision: Walking stays on the existing TravelGraph median, with a safety buffer as the dial for lateness. No Nemotron call for walking. Measured over weeks 2-8: no learning 2.1 min / 99% of walks planned short (Maya); travel graph median 0.8 min / 39%; Nemotron 0.8 min / 40% (Maya) and 1.3 min / 8% against the median's 0.6 min / 46% (Jordan); median plus a 15% buffer 2.1 min / 0% and 1.8 min / 0%. Nemotron did learn the pattern, reaching 1.15/1.15/1.45/1.11 against a truth of 1.15/1.15/1.44/1.09 and naming the uphill leg every week.
Why: It ties the code on one student and loses on the other. Its only real contribution was refusing to plan short, and a buffer buys that in code with no latency and no call. On Jordan it would not go below 1.0 even though its own memo said he was fast, so the caution is a bias, not judgement.
Affects: docs/learning/02-walking.md, the `existing-buffered` arm. The buffer size is a product decision that is not yet made; nothing is wired into the live TravelGraph.

## 2026-09-19 21:40 ET · Jatin · Where a model earns its place, from two aspects
Decision: Use Nemotron for an aspect only when the signal is sparse, noisy and not already modelled. Assignments: 1-3 records a week, wide spread, no existing mechanism, Nemotron 3.9 min against the code baseline's 6.8. Walking: 3 records a week per leg, 10% spread, already a median, Nemotron 0.8 against 0.8.
Why: It gives a cheap test to apply to the remaining aspects before building them, instead of discovering the answer after a full experiment each time.
Affects: the order and framing of aspects 3 (procrastination) and 4 (exam studying). Both look sparse and noisy, so both are expected to be closer to assignments than to walking.

## 2026-09-19 23:10 ET · Jatin · Walking is one pace per person plus earned per-leg exceptions, and it is never padded
Decision: Rebuilt aspect 2 to the owner's specification. The learner holds one walking pace learned from all walks pooled, which applies to every leg including ones never walked; a leg gets its own number only after disagreeing with that pace in 2 separate weeks; nothing changes before week 2. The earlier `existing-buffered` padding is rejected: if the student walks a 10-minute leg in 8, the app shows 8. AspectSpec gained an optional `global` block (warmupWeeks, exceptionMinWeeks, exceptionThreshold) and WeekMemory gained `global` plus a code-kept `evidence` tally, so the same machinery serves aspects that are "one trait plus exceptions".
Why: The per-leg-only design I built first needed three trips before it knew anything about a leg, so a student who changes buildings gets nothing. Pace is a fact about the person and transfers immediately. Padding upward inflates every gap and contradicts the honest ledger, which is the product's whole premise.
Affects: weeklyLearner.ts, learningExperiment.ts, student.ts (a fifth leg appearing in week 5 as the transfer test), docs/learning/02-walking.md.

## 2026-09-19 23:10 ET · Jatin · Aspect 2 result: Nemotron learns the pace and the reason; the median is still better on well-travelled legs
Decision: Recommend a split. Nemotron supplies the person's pace (Maya 1.17 against a truth of 1.15; Jordan 0.93 against 0.92, correctly recognising he is faster than the app assumed) and identifies which leg has a real reason; the travel graph median keeps legs with plenty of history, where it is more accurate (0.8 min against Nemotron's 1.2 for Maya). Unprompted in week 1 it wrote "walks consistently faster than app defaults, except Benedum to Cathedral which has a hill or slow lift", separating the person from the route. Its remaining weakness is overshooting an exception (hill leg 1.58 against 1.44) because it takes it from a single week instead of easing in.
Why: Each method is better at a different thing, and the pace is the part that transfers to a leg with no history, which the median cannot do at all.
Affects: docs/learning/02-walking.md. Nothing is wired into the live TravelGraph yet.

## 2026-09-19 23:10 ET · Jatin · Reject any number closer to the reciprocal of the evidence than to the evidence
Decision: Added `isInverted` to the weekly learner. In week 6 of a live run Nemotron answered a pace of 0.84 for a week that ran 1.18x while its own memo said "walks 16% slower"; 0.84 is 1/1.18, so it had flipped the ratio, and every displayed walking time would have collapsed at once. Code now refuses such a value for both the pace and any exception.
Why: The guard took mean error from 1.7 to 1.2 and removed the failure from the re-run. The general lesson for the remaining aspects: the model is reliable about direction and reason and unreliable about arithmetic, so every number it returns is checked against the evidence it was handed.
Affects: weeklyLearner.ts, weeklyLearner.test.ts.

## 2026-09-20 00:20 ET · Jatin · Aspect 3 (procrastination): predict when work gets started, and score it on blown deadlines
Decision: Added the procrastination aspect. The learner predicts, per kind of work, how many hours before a deadline the student actually begins, against the app's current assumption of 12 hours. It is scored on the prediction error and, more importantly, on how many genuinely blown deadlines it sees coming. The synthetic student now leaves the work it dreads until last (big assignments started closest to the wire despite needing the most time) and its deadlines can really be missed; the floor that used to guarantee every task finished in time was removed. AspectSpec gained an optional `clamp`, because a student who starts two hours before a deadline sits at 0.15 of the app's assumption, far below the usual 0.4 rail.
Why: This is the third item on the owner's list and the first where the answer is not a duration. The interesting output is not the number but the warning it enables, so the metric had to be blown deadlines caught, not mean error.
Affects: student.ts (leadFactor, missable deadlines), weeklyLearner.ts (clamp, Observation.meta), learningExperiment.ts, docs/learning/03-procrastination.md.

## 2026-09-20 00:20 ET · Jatin · Aspects 1 and 3 only pay off together
Decision: Deadline risk is computed with the work length aspect 1 learned, not the student's own estimate. Measured on the held-out student, who blows 8 of 24 deadlines: no learning catches 0, the running average 2, Nemotron 7 with the learned work length and only 4 with the student's own estimate.
Why: A deadline is blown when the student starts later than the work needs, so predicting it requires both halves. Knowing someone procrastinates is not actionable until you also know their work runs 1.6x what they think. This is the first evidence that the aspects compound rather than being independent features.
Affects: the case for finishing the remaining aspect, and how the warning should be built if it ships.

## 2026-09-20 00:20 ET · Jatin · Open failure: Nemotron describes its own procrastination numbers backwards
Decision: Recorded, not yet fixed. Nemotron's memo for Maya says she "completes big assignments and labs quickly but procrastinates on regular assignments" while the multipliers it just chose say the opposite; Jordan's says he "finishes work well ahead of schedule" while the number it chose means he starts fifty minutes before a deadline. The arithmetic is right and the meaning is inverted, which is a different failure from the reciprocal bug in aspect 2 and is not caught by `isInverted`.
Why: The memo is the model's memory, so a wrong belief is carried into every later week, and the same sentence would tell a student the reassuring opposite of the truth if it ever reached the voice agent. No text from this aspect should be shown to anyone until there is a check that a sentence agrees in direction with the number it accompanies.
Affects: weeklyLearner.ts, and any plan to surface learning through the voice agent.

## 2026-09-20 00:20 ET · Jatin · Nemotron catches deadline risk by being pessimistic, not by being accurate
Decision: Noted as a limitation of the current design. Nemotron put the held-out student's big assignments at 0.07 against a truth of 0.183, and that bias is why it catches 7 of 8 blown deadlines while also raising 2 false alarms. On the other student it wandered (0.55, 0.44, 0.75, 0.50, 0.35, 0.25, 0.35, 0.30) rather than settling, where the running average was steadier.
Why: Catching risk through a uniformly gloomy average is not the same as predicting well. The honest version predicts the spread ("usually 2.2 hours, sometimes 1.4") and warns on the bad tail, instead of moving the mean.
Affects: a future revision of the procrastination aspect; nothing ships from it yet.

## 2026-09-20 01:10 ET · Jatin · Aspect 4 (exam studying): predict the cram share, warn when the last night cannot hold it
Decision: Added the exams aspect. The learner predicts what share of revision lands in the final 24 hours per kind of assessment, against the app's assumption of an even third, and is scored on whether it can see in advance that the last night has less usable gap than the cram needs. The synthetic student now sits a weekly quiz plus two midterms, and quizzes get crammed hardest.
Why: Fourth and last item on the owner's list, and the only one where the target is a distribution rather than a quantity. The useful output is the warning, so the metric is under-capacity nights caught.
Affects: student.ts (ExamRecord, weekly quizzes), learningExperiment.ts, docs/learning/04-exam-studying.md.

## 2026-09-20 01:10 ET · Jatin · Aspect 4 goes to the running average, not Nemotron
Decision: Use the running average for exam cramming. Both catch every under-capacity night (2 of 2 for Maya, 4 of 4 for the held-out student) and both reach the same mean error, but Nemotron's learned values are clearly worse: quizzes 1.96 against a truth of 2.94 and midterms left at 1.00 against 2.40. It jumped to 3.0 for quizzes in week 1, pulled back to 1.96 in week 2, then did not move for six weeks while remaining wrong, and never learned midterms at all because they occur twice in eight weeks and the evidence threshold never cleared.
Why: It reaches the right warning through a wrong number, which holds only while the gap between the cram and the night is wide. The running average is more accurate, learns the sparse category, and costs nothing.
Affects: docs/learning/04-exam-studying.md. The warning itself is worth building regardless of which produces the number.

## 2026-09-20 01:10 ET · Jatin · All four aspects measured: where a model earns its place
Decision: Of the owner's four aspects, Nemotron earns its place on two. Assignment length: 3.9 min mean error against the code baseline's 6.8, and it learns nearly the whole pattern from one week. Procrastination: 7 of 8 blown deadlines caught against the baseline's 2. Walking: the travel-graph median is more accurate on well-travelled legs, but only the model produces a transferable pace and a reason ("a hill or slow lift"), so use both. Exam cramming: a tie on the outcome and worse numbers, so use the running average.
Why: The pattern across all four is that the model pays off where the signal is sparse, noisy and not already modelled, and where the useful output is a judgement or an explanation rather than an average. Where the quantity is frequent, tight, or already has a mechanism, code matches or beats it.
Affects: what should be wired into live planning, and the case to make for the NVIDIA track.

## 2026-09-20 03:05 ET · Jatin · Learning is a registry, not a feature: one engine, eleven aspects, generic for any user
Decision: Generalized everything learned across the four measured aspects into a live engine. `src/core/aspects.ts` is a declarative registry: an aspect states what the app currently assumes, how to pull this week's evidence out of what the app already records, and what changes once it is known. `src/lib/learned.ts` runs every aspect weekly, keeps each one's memory, and exposes what the rest of the app reads. Adding an aspect is a registry entry plus one line where its correction applies; it needs no new learner, prompt, route or test scaffolding. Eleven are registered: work length, course load, procrastination, time of day, gap fit, walking, settling in, meals, exam cramming, follow-through and which suggestions the student accepts.
Why: The goal is pattern recognition for any user across anything in the app, not four hand-built features. Every aspect turned out to be the same question — the app assumes X, what does this person actually do — whose answer is a multiplier on the app's assumption, which is what lets one learner serve all of them.
Affects: src/core/aspects.ts, src/lib/learned.ts, /api/learning/review, /api/learning/profile, src/lib/today.ts, src/agents/voiceTools.ts.

## 2026-09-20 03:05 ET · Jatin · Layered aspects learn the residual, never the whole error
Decision: An aspect declares `onTopOf`, and the engine hands it a baseline that already includes those corrections. course_load sits on work_length; time_of_day and gap_fit sit on both.
Why: Caught in live testing. work_length learned big assignments at 1.37x and course_load learned MATH 0220 at 1.33x from the same completions, so a task that was both got 1.82x and a 90 minute problem set was planned at 164. With the layering it is 127, and the course correctly shows almost no residual of its own once the kind of work is accounted for.
Affects: src/core/aspects.ts (LearningInput.baseline, AspectDef.onTopOf), src/lib/learned.ts.

## 2026-09-20 03:05 ET · Jatin · Every sentence the student sees is written by code from the multiplier
Decision: `learnedFacts()` derives its wording from the number itself, and the voice agent's get_coach reads those sentences. Nothing Nemotron phrases is shown to a student.
Why: In aspects 3 and 4 the model described its own numbers backwards ("completes big assignments quickly" for the student who starts them last). The arithmetic was right and the meaning inverted, which no numeric check catches. Deriving the words from the number makes the disagreement impossible rather than unlikely, and a test asserts direction for every aspect.
Affects: src/lib/learned.ts, src/agents/voiceTools.ts, src/core/__tests__/aspects.test.ts.

## 2026-09-20 03:05 ET · Jatin · A student the app knows nothing about gets the app exactly as it was
Decision: Every aspect returns a multiplier of 1 until it has enough evidence, and an aspect whose signal the app does not yet record collects nothing and stays inactive. A test asserts a new user's planning, risk and offers are untouched.
Why: The learning must be a correction to a working app, never a precondition for one. It also means a new aspect can be registered before the data that feeds it exists, which is how the remaining signals (walks, settling in, meals, exam cramming) are already wired and waiting.
Affects: src/lib/learned.ts.

## 2026-09-20 03:05 ET · Jatin · The NVIDIA key in .env.local is truncated and chat completions are 403
Decision: Recorded so it is not mistaken for a code fault. The stored key is 29 characters; a valid nvapi key is about 69. `/v1/models` returns 200 because that endpoint needs no auth, which makes the key look healthy on the diagnostics route while every chat completion fails with 403 Forbidden.
Why: The weekly review degraded to the running average for every aspect and kept working, which is the designed behaviour, but the learning is not Nemotron's until the key is replaced. Re-paste it in full.
Affects: .env.local, and anyone reading /api/nvidia as proof the key works.

## 2026-09-20 03:50 ET · Jatin · One learned profile per person, never a shared one
Decision: The learned state is keyed by user id (`learned(userId)`, `resetLearned(userId)`, `knownUsers()`), not held in a single global slot. Two students with identical tasks end up with different multipliers, different planned minutes and different sentences; a test seeds two people from the same task list and asserts one runs long, the other short, and that neither profile touches the other.
Why: Nothing in the numbers was ever hard-coded — every multiplier is derived from that person's own completions and the sentence only supplies the wording around it — but the storage had no user identity, so two users on one server would have shared a brain. That defeats the whole point of personalisation.
Affects: src/lib/learned.ts, and anything that later persists this to Postgres: the row key is the user.

## 2026-09-20 03:50 ET · Jatin · A multiplier may move toward the week's evidence but never past it
Decision: Added `towardEvidence` to the weekly learner. Any number the model returns, for a global pace or a category, is confined to the interval between where it stood and what the week actually showed. Going past is refused and the reason is recorded.
Why: Found while verifying the live run. Reviewing the same week repeatedly ratcheted big assignments from 1.37 to 1.75 to 1.85 while the week's own ratio stayed near 1.4, and the model wrote "the multiplier must stay above 1.85" to justify it. An estimate that inflates on every review is worse than one that never learned. The earlier idempotency test only checked a single repeat, so the slow drift passed; there is now a test that reviews the same week six times and asserts it settles.
Affects: src/agents/weeklyLearner.ts. It also subsumes the safety rail in practice: a model answering 50 now lands on the week's 1.33 rather than the clamp's 3.
