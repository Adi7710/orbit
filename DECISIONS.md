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

## 2026-09-19 16:05 ET · lead Claude · One bus engine for both screens; the card deep-links into the map
Decision: Deleted src/lib/transit.ts (planLeg, PLACES). buildToday() now calls the same buildJourney() the map uses, picks the leg that matters right now (to the next class, else home after the last one), and returns verdict, live status, vehicle distance, walk and ride legs, plus a mapHref. /map reads from, to and arriveBy from the query string and keeps them in the URL, so the Today card opens the map on the exact journey it was showing. Verified: both report leave-by 15:48 for the same leg.
Why: Two code paths computing the same time is how a demo shows 14:02 on one screen and 14:07 on the next. One engine, two renderings.
Affects: src/lib/today.ts, src/lib/journey.ts, src/app/TodayClient.tsx, src/app/map/*, iOS `bus` model (new fields: status, verdict, classAtText, vehicleKm, walkToDest, mapHref).

## 2026-09-19 16:05 ET · lead Claude · Tunnel is supervised, and its URL is not stable
Decision: scripts/tunnel.mjs supervises cloudflared, writes the live URL to .tunnel-url.txt and restarts on death. Current URL: https://drama-times-screens-valley.trycloudflare.com
Why: The first quick tunnel was revoked by Cloudflare after about an hour ("Tunnel not found") and the team's URL went dead silently. Quick tunnels are fine for browsing and for the iOS simulator, but the ElevenLabs webhook must be re-pasted whenever the URL changes, so Vercel is still required before the voice agent is wired for real.
Affects: scripts/tunnel.mjs, issue #7, #21, #23.

## 2026-09-19 16:20 ET · Jatin · No "Your patterns" card; habits become an agent, not a screen
Decision: Removed HabitsCard and its line in TodayClient. The pure habit math (src/core/habits.ts), the seeded synthetic history, the verifier and /api/habits stay as the foundation for a weekly learning agent that adjusts the app's estimates from a student's history; nothing about habits is shown as a card.
Why: The owner wants the learning to happen inside the app's planning and voice agent, not as a report the student reads.
Affects: src/app/TodayClient.tsx (back to main's version), issue/PR #25.

## 2026-09-19 16:25 ET · lead Claude · The voice tools follow the tunnel automatically
Decision: New scripts/repoint-voice.mjs PATCHes api_schema.url in place on the four registered ElevenLabs tools, matched by name. scripts/tunnel.mjs calls it the moment it detects a new quick-tunnel URL, so a rotation repairs itself. Tool ids, tool_ids on the agent and ELEVENLABS_AGENT_ID are all unchanged, so nothing restarts. A failure to re-point is logged loudly with the exact command to run and never takes the tunnel down with it.
Why: A quick tunnel is ephemeral — ours was revoked about an hour after it started — and setup-voice-agent.mjs is the wrong tool for the repair because it deletes the tools, creates a *new* agent and writes a new agent id that only takes effect after a dev-server restart. That is fine once, at the start; it is not something you can do while a judge is holding the microphone. The failure this prevents is worse than an outage: with stale URLs the agent calls a dead webhook, gets nothing, and improvises around the missing numbers. Inventing a number is precisely what the server-composes-the-sentence design exists to prevent, so a rotated tunnel would have turned beat 4 into a live demonstration of the failure we told judges we had engineered away.
Verified: rotated the tunnel deliberately. The new URL was minted, all four tools re-pointed within seconds with their ids unchanged, the agent still referenced all four, and all four answered through the new public URL with finished spoken sentences; a wrong secret still gets 401.
Affects: scripts/repoint-voice.mjs, scripts/tunnel.mjs, docs/voice.md, issue #23.

## 2026-09-19 16:25 ET · lead Claude · ANTHROPIC_API_KEY and NVIDIA_API_KEY are present as empty lines, not as keys
Decision: Recording this because it reads as done and is not. Both variables exist in .env.local with nothing after the `=`, so /api/nvidia reports keyPresent:false, the Day Agent serves deterministic proposals and the Critic runs its rule-based rubric. Nothing is broken — every one of those paths is a designed fallback and the demo holds without a key — but beat 2 speaks in the canned voice and beat 5 has no model evidence behind it until they land.
Why: A present-but-empty variable is the failure that looks like success. The restart I did to pick up "the new keys" changed nothing, and only /api/nvidia's explicit keyPresent flag showed it.
Affects: beat 2 (Plan my day), beat 5 (the eval table), issue #4.

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

## 2026-09-19 16:40 ET · lead Claude · Re-pointing finds our tools by webhook path, not by a list of names
Decision: scripts/repoint-voice.mjs no longer matches a hardcoded ["get_today","log_actual","set_mode","get_bus"]. It re-points every registered tool whose url matches /api/voice/tool?tool=<name>, and takes the tool name out of that url rather than the display name.
Why: The hardcoded list was written against four tools and Jatin's get_estimate and get_coach landed about two hours later. After the next tunnel rotation those two would have kept pointing at a dead host while the other four healed silently — a partial failure, which is worse than a total one, because voice would still mostly work and nobody would go looking. Anything registered against our own webhook path is ours, however many there turn out to be.
Affects: scripts/repoint-voice.mjs, docs/voice.md.

## 2026-09-19 16:40 ET · lead Claude · The two new voice tools existed in code but not in ElevenLabs
Decision: Re-ran setup-voice-agent.mjs so all six tools are registered and the agent references all six. New ELEVENLABS_AGENT_ID written; dev server restarted.
Why: get_estimate and get_coach were added to the setup script and to voiceTools, and both answer correctly on localhost, but the ElevenLabs registry still held only the original four, so the live agent had no way to call them. Adding a tool is the one case that genuinely needs the agent recreated, which is exactly why that is a deliberate command and not something the tunnel does on its own.
Affects: the ElevenLabs tool registry, .env.local, issue #7.

## 2026-09-19 16:50 ET · lead Claude · The setup script was silently doubling the ElevenLabs tool registry
Decision: setup-voice-agent.mjs deletes old tools with ?force=true and reports the real outcome instead of printing "removed" unconditionally. Cleaned up by hand: deleted the orphaned agent and force-deleted four duplicate tools. The registry is now exactly six tools and one agent.
Why: Deleting a tool returns 409 while anything still references it — including a *branch* of an agent that has already been deleted, which is what we hit. The old code wrapped that in .catch(() => {}) and logged "removed old tool" regardless, so the failure was invisible and every re-run added another copy. We were at ten tools with duplicate names, four of them belonging to a dead agent. Nothing was broken yet, but re-pointing was doing four pointless PATCHes and the next person to read the dashboard would have had no idea which get_today was live.
Verified: registry listed and confirmed at six tools, one agent, all six referenced by it, all six answering 200 through the public webhook.
Affects: scripts/setup-voice-agent.mjs, the ElevenLabs workspace.

## 2026-09-19 16:55 ET · lead Claude · The clamp moves into the pure core and is proven without a key
Decision: Extracted clampToBaseline (and CLAMP_LO/CLAMP_HI) from src/agents/estimate.ts into src/core/estimator.ts, and added src/core/__tests__/clamp.test.ts. Six tests, no network, no key: the original "Quiz 3 prep" 240 collapsing to 90, a sensible 50 passing through untouched, an implausibly small answer pulled up, exact edge inclusivity, and a property test that no model output up to 100000 can leave [0.5x, 2x] for any title in the eval set. Fixed an off-by-one in docs/eval.md, which advertised the window as 22 to 90 when Math.round(45*0.5) is 23.
Why: docs/eval.md tells a judge that a five-times miss is "structurally impossible rather than merely discouraged", and that is the strongest claim we make for the NVIDIA track. It rested on four lines of arithmetic inside a function that could not run without an API key, and grep for "clamp" across the test suite returned nothing — the one claim we most want checked was the one nobody could check. Arithmetic belongs in the pure core per CLAUDE.md; this is also the only part of the eval story that survives the key never arriving.
Affects: src/core/estimator.ts, src/agents/estimate.ts, src/core/__tests__/clamp.test.ts, docs/eval.md.

## 2026-09-19 16:55 ET · lead Claude · The eval table carries no signal without the key, and says so
Decision: Ran /api/eval on main with no NVIDIA_API_KEY and recorded the result in docs/eval.md rather than leaving the row blank: all three scorers return MAE 16.3, 9/10, identical, because zeroshot and anchored both report answeredByModel 0/10 and fall back to the heuristic ten times out of ten.
Why: Beat 5 is the eval table. In its current state it shows a judge three copies of the same number, which reads as "the model does nothing" — the opposite of the story. The harness is behaving correctly and naming the reason, so this is a blocker on Jatin's key, not a bug. Worth writing down so nobody demos this table as-is.
Affects: docs/eval.md, beat 5, issue #4.

## 2026-09-19 17:10 ET · Adi + lead Claude · Orbit takes turns like a person, and the mic is shut between them
Decision: New scripts/voice-config.mjs holds the personality (turn-taking, pacing, system prompt) and is imported by both setup-voice-agent.mjs at create time and a new scripts/tune-voice.mjs that PATCHes the live agent in place. Applied: turn_eagerness patient, turn_timeout -1, soft_timeout_config at 1.0 s with four varied fillers, tts optimize_streaming_latency 3 -> 1, speed 0.95, and a prompt that tells it to let the student finish and allows two or three words of acknowledgement while it thinks. VoiceButton now mutes the microphone between turns via setMicMuted and opens it only while the button or the spacebar is held, with a hands-free checkbox for the demo.
Why: Adi's feedback after the first real conversation: it answered the instant he stopped making noise, which reads as a kiosk rather than a friend, and it kept listening afterwards so it picked up the room. turn_eagerness patient is the substantive fix — on normal the first gap in speech is the agent's cue, so pausing to think gets you interrupted. The latency that patience costs is the thing that makes it feel considered, which is what he actually asked for. reasoning_effort would have been the literal answer but the API rejects it for claude-sonnet-4-5 ("Reasoning effort is not supported for this LLM"), so the conversational beat comes from patience plus fillers instead. turn_timeout had to go to -1 because with a muted mic the agent would otherwise nag into a silence it created and cannot hear out of.
Kept deliberately: barge-in. Holding the button while it speaks interrupts it. A friend you cannot talk over is a voicemail.
Not softened: the rule that every number must come from a tool result, now with an explicit line saying sounding natural never justifies rounding or re-saying a figure — conversational pacing is exactly the pressure that would otherwise produce an invented number.
Verified: tune-voice.mjs --show reports patient / -1 / 1.0 s / 1 / 0.95 with tool count still 6, so tuning the personality did not detach the tools. tsc clean, 98 tests.
Affects: scripts/voice-config.mjs, scripts/tune-voice.mjs, scripts/setup-voice-agent.mjs, src/app/VoiceButton.tsx, docs/voice.md.

## 2026-09-19 17:25 ET · Adi + lead Claude · Push-to-talk is built for a thumb, not a spacebar
Decision: The hold-to-talk control is now touch-first. The spacebar listener and its on-screen hint only appear where a keyboard exists (matchMedia("(pointer: fine)")), so a phone is never told to hold a key it does not have. Added pointer capture, touch-action: none, and the iOS selection/callout suppressions so a long press cannot turn into a page scroll or a copy menu, a larger tap target, and two safety closes: onPointerCancel and a visibilitychange/pagehide handler.
Why: Adi's note that Orbit is an iOS app first. Two of these are correctness, not polish. iOS fires pointercancel whenever the system takes a touch away — a notification, the lock button, an incoming call — and without handling it the microphone stays open while the button renders idle, which is precisely the always-listening behaviour push-to-talk exists to remove. The old blur-based safety close lived inside the keyboard-gated effect, so on a phone it never ran at all: backgrounding the app mid-hold would have come back with a hot mic.
Affects: src/app/VoiceButton.tsx, issue #14 (iOS voice).

## 2026-09-19 17:25 ET · Adi + lead Claude · Written down: nothing in Orbit is trained on the student
Decision: New docs/data-and-learning.md states plainly that there is no training or fine-tuning anywhere, names what each of the three models actually sees, and points at the code where the personalisation really lives (estimator.ts: 5 samples, trimmed, capped 3x; habits.ts: >=3 sessions and >=0.15 pace gap). Includes the sentence to say if a judge asks.
Why: Adi asked whether the agent is trained on his data. It is not, and a demo of "personalised AI" invites everyone to assume it is. Claiming learning we do not do would be the easiest way to lose a track on a follow-up question. The honest version is also the stronger one: it works on day one with no history, every number is auditable, and docs/eval.md already shows we measured the model on that job, lost to a ten-line heuristic, and changed the design instead of hiding the result. The only real fine-tune in the plan (#5, Brev) is stretch-only and would train on the synthetic log.
Affects: docs/data-and-learning.md, docs/pitch.md (Akshat), README (#11).

## 2026-09-19 17:45 ET · Adi + lead Claude · A real Canvas feed found three bugs the synthetic sample could not
Decision: Syncing Adi's actual Canvas feed (98 events) exposed three failures, all now fixed in the pure core with tests pinned to the real title shapes in src/core/__tests__/canvas-real.test.ts.
  1. Half the feed was fiction. 49 of 98 events are class meetings ("2026F FE 570-A", "2025S MGT 808-WS1 FUNDAMENTALS OF CONSULTING") and were being imported as assignments, inventing hours of coursework nobody has to do, inflating the capacity ledger and then feeding that fiction into the habit history. isClassMeeting() now filters them and the import reports skippedMeetings.
  2. Course identity was split in half. Canvas writes the course *code* only on meetings and the course *name* on everything, so 37 tasks keyed under "Fundamentals of Consulting" and 13 under "MGT 808" as if they were different courses. Neither bucket could ever reach the estimator's five samples, so the agent could never say "your MGT 808 estimates are 1.57x what you guess". resolveCourseCodes() learns name -> code from the events carrying both and lends it to the rest; all 25 real tasks now key under MGT 808.
  3. The ledger was meaningless. 50 of 59 tasks came back at exactly 60 minutes because heuristicMinutes had never seen a case study, a ManageMentor module, a weekly discussion post or a video introduction. Estimates now spread across 15/30/40/60/75/90/120/180.
Why: The synthetic sample passed happily through all three. This is the argument for testing against real data shapes even when the data itself never enters the repo.
Verified: re-import gives skippedMeetings 49, all 25 tasks under MGT 808. Then five real completions logged through the voice tool produced a genuine calibration of MGT 808 x1.57 over 5 sessions, and get_estimate now says "you would say two hours, but your history says three hours nine" for a case study it has never seen. 111 tests.
Affects: src/core/ics.ts, src/core/estimator.ts, src/app/api/import/route.ts, src/core/__tests__/canvas-real.test.ts.

## 2026-09-19 17:45 ET · lead Claude · Course codes are three OR four digits
Decision: codeFromText and isClassMeeting accept \d{3,4}, not \d{3}.
Why: Caught by a test, not by inspection. Stevens writes FE 570 and MGT 808; Pitt writes CS 0441, MATH 0220, ENGCMP 0200. Pinned at three digits the matcher worked perfectly on the feed in front of me and silently dropped every code from the campus the rest of the app is built around.
Affects: src/core/ics.ts.

## 2026-09-19 17:45 ET · lead Claude · Canvas gives future work; the habit space learns from finished work
Decision: Recording the boundary, because it is easy to over-claim. Importing Canvas does not teach Orbit anything by itself — a feed is a list of things that have not happened. The habit space and the estimator learn only from completions with real durations, which arrive when the student says "that took ninety-five minutes". Canvas's contribution is that the tasks being completed are finally real ones.
Why: Adi asked for the model to learn from the data in the habit space. The loop is import -> estimate -> complete by voice -> estimator and habits adjust, and it is now proven end to end on real data. Until a student logs five sessions in a course, that course's multiplier is honestly absent rather than guessed, which is the same discipline as the 5-sample minimum everywhere else.
Affects: docs/data-and-learning.md, issue #26.

## 2026-09-19 18:00 ET · Adi + lead Claude · Canvas auto-completion and location-based attendance: designed, deliberately not built
Decision: docs/future-signals.md records both features Adi asked for, with the constraints that matter, and neither is in scope before submission.
Why they are deferred, not just unfinished: Canvas completion state is not in the .ics feed at all — it only exists behind the REST API, which needs a personal access token. A feed URL is read-only for a calendar; a token is read-write for the whole account, and that is a much larger thing to ask a judge or a student to trust for a feature nobody sees in the demo. Location needs background authorisation and a real answer to false positives in Oakland, where four buildings sit inside GPS drift of each other.
The two design conclusions worth keeping: (1) Canvas knows an assignment is done but not how long it took, and submitted_at is not a duration, so auto-completion must mark the task complete and then *ask* for the minutes — which makes it the best prompt we could have for the one piece of data the estimator actually needs. (2) Location is never sufficient alone; it must be a conjunction of region, the class's own time window, and a dwell of ten minutes, with the phone evaluating it locally and sending only a block id and a boolean, never a coordinate.
The invariant both share: an unverified signal may change what is on the screen, but may never award XP or manufacture an estimator sample. Submission alone awarding XP is a farming vector (submit blank work repeatedly), and spoofed location would be the same, which is why the answer to spoofing is simply that attendance is worth no points.
Affects: docs/future-signals.md, and a future issue if we pick either up after the hackathon.

## 2026-09-19 18:30 ET · Adi + lead Claude · The Email Agent: a separate agent that writes to instructors, and cannot send
Decision: New src/agents/emailAgent.ts with its own prompt, plus pure src/core/emailDraft.ts and src/core/contacts.ts, POST /api/email, a send_email Tier B proposal, and a seventh voice tool draft_email. Say "professor I am not feeling good today, can I take a leave" and a formal email to the right instructor is written, read back aloud in full, and queued for approval.
Why its own agent: it is the only agent in Orbit whose output is read by another human being. The Day Agent moves a task around your own screen; this one writes to your professor under your name. It is deliberately not a Day Agent tool, so it gets its own prompt, its own validation and its own blast radius.
Three safety properties: (1) it cannot send — approval hands the finished message to the student's own mail client via mailto, so Orbit holds no mailbox credential and there is no configuration in which an agent delivers to a professor; (2) it cannot choose the recipient — the address is server-side and validateDraft rejects any draft that changed it; (3) it cannot invent a reason — the intent is classified in code before any model runs, and the output is rejected for invented medical detail, promises made on the student's behalf, not addressing the instructor, or running long. On rejection the deterministic letter is used and the reason is reported.
Works with no key, which is the state we are in: emailDraft.ts writes a real, sendable letter for all four intents. If the student says why they are ill, the letter still says only "I am unwell" — a letter to a professor should not carry a medical claim they did not choose to write down.
Addresses are synthetic on example.edu, a reserved domain that cannot deliver. Verified directly: the Canvas .ics feed carries no ORGANIZER, no ATTENDEE and nothing email-shaped, so real addresses need the Canvas REST API and a token. During a hackathon that limit is a feature — a demo that can reach a real professor is one misclick from emailing a real professor.
Verified: all four intents on the real Canvas courses, natural-language course resolution ("consulting" -> MGT 808), ambiguity returning a list rather than a guess, and the tool end to end through the public webhook. 131 tests.
Affects: src/agents/emailAgent.ts, src/core/emailDraft.ts, src/core/contacts.ts, src/app/api/email, src/app/api/proposals/[id], src/agents/voiceTools.ts, src/agents/dayAgent.ts, scripts/setup-voice-agent.mjs, docs/email.md.

## 2026-09-19 18:30 ET · lead Claude · Outlook sending needs Microsoft Graph, not an MCP connector
Decision: Real sending from a school address is deferred and written up in docs/email.md. mailto is the shipped delivery.
Why: An MCP server attached to a Claude session lets *Claude* send mail; it does not give *Orbit* the ability, which is what the product needs. That path is an Azure app registration in the school tenant, delegated Mail.Send plus Mail.Read for replies, and admin consent — most universities block student app registrations or route them through IT, which is a multi-day approval and not an overnight one. The right shape for a real product and the wrong shape for a Saturday.
Also worth stating: mailto is not a consolation prize. The last approval being a human pressing send in their own client is a step nobody can accidentally skip, which is exactly what you want on the one feature that reaches a professor.
Affects: docs/email.md, docs/future-signals.md.

## 2026-09-19 18:30 ET · lead Claude · "I need until Friday" is an extension request
Decision: classify() also matches until/by + a weekday or date.
Why: Caught by a test, not by reading the code. The keyword list had extend, extension, more time, push back, deadline — and none of them appear in the most natural way a student actually asks, which was being filed as a general question and producing the wrong letter entirely.
Affects: src/core/emailDraft.ts.

## 2026-09-19 18:55 ET · Adi + lead Claude · The draft opens as a window, is fully editable, and goes to Outlook
Decision: src/app/EmailModal.tsx opens by itself the moment the Email Agent writes something. To, subject and body are all editable. Two send buttons: "Open in Outlook" (outlook.office.com compose deeplink, prefilled, in the tab the student is already in) and "Open in mail app" (mailto). Edits are sent with the approval so the log records what was actually sent, not what we suggested. While a call is live TodayClient polls every 2.5 s so the window is open before the agent stops speaking.
Why: Adi's feedback — he could not edit the draft at all, and after talking he had to scroll to find the thing he had just asked for. A letter to your professor is not a notification, and the agent's draft is a starting point, not a finished document with his name on the bottom of it.
Affects: src/app/EmailModal.tsx, src/app/TodayClient.tsx, src/app/VoiceButton.tsx, src/app/api/proposals/[id]/route.ts.

## 2026-09-19 18:55 ET · Adi + lead Claude · Real instructor addresses are typed in, never shipped
Decision: POST /api/email/roster saves one instructor's address at runtime, held in memory only. mergeRoster layers it over the synthetic sample, and the draft window has a "Remember for this course" button. The shipped roster stays entirely on example.edu, which cannot deliver. The modal warns in amber whenever the recipient is still a sample address.
Why: Adi asked for real professor data for the demo. Scraping a staff directory into a public repo is a different kind of problem from the one we are solving, and committing real addresses is not something to undo later. Typing one in at runtime gets the same demo, with nothing to leak: the address never reaches disk or git. The salutation is derived from the name so a real address does not produce "Dear Your instructor,".
Still true: Orbit holds no mailbox credential and cannot send. Both buttons hand the message to the student's own client, from their own address, with Send theirs to press. Direct sending needs Microsoft Graph and tenant admin consent, per docs/email.md.
Affects: src/core/contacts.ts, src/app/api/email/roster/route.ts, src/lib/store.ts, src/app/EmailModal.tsx.

## 2026-09-19 18:55 ET · lead Claude · A new store field must never 500 the route that reads it
Decision: mergeRoster accepts undefined, and the roster route does s.contacts ??= [].
Why: The store is a module-level object that survives hot reload, so adding `contacts` to its type did not add it to the object already in memory: every call 500'd with "s.contacts is not iterable" until a restart. A restart would also have wiped the imported Canvas data, which is exactly the moment you do not want to be forced into one.
Affects: src/core/contacts.ts, src/app/api/email/roster/route.ts.

## 2026-09-19 18:50 ET · lead Claude · A new store field can no longer break a running server
Decision: store() backfills any key a seeded store has that the live object is missing, guarded by a cheap presence check so seed() is not rebuilt on the hot path.
Why: The store is a module-level object that deliberately survives hot reload, so adding `contacts` to the type did not add it to the object already in memory. Every route touching it 500'd with "not iterable" until a restart — and a restart wipes an imported calendar, which is exactly the moment you least want to be forced into one.
Affects: src/lib/store.ts.

## 2026-09-19 19:00 ET · Adi + lead Claude · The Ask agent: answer anything, ground every number, defend it
Decision: New src/agents/ask.ts with pure src/core/factsheet.ts and src/core/answerCheck.ts. A factsheet of every fact Orbit may state is built from the deterministic core, each with a key, the numbers it licenses and the code it came from. A question retrieves the facts that bear on it, a model phrases them, and code then checks that every number in the answer was licensed — an unlicensed number discards the model's wording entirely and states the facts plainly instead. Two new voice tools: `ask` for anything the dedicated tools do not cover, and `why`, which reads back the facts and where they were computed. The old default branch, "I only know your schedule, your tasks and your bus", is gone.
Why: The server-writes-the-sentence rule does not survive open questions — you cannot pre-write a sentence for a question nobody has asked yet. This is the replacement, and it inverts the usual approach: instead of asking a model to stick to its context, the context is enumerable and the check afterwards is arithmetic.
Affects: src/agents/ask.ts, src/core/factsheet.ts, src/core/answerCheck.ts, src/agents/voiceTools.ts, scripts/setup-voice-agent.mjs.

## 2026-09-19 19:00 ET · Adi + lead Claude · The self-eval loop, and what it is not
Decision: src/core/questionBank.ts holds 24 questions with the fact keys a right answer must rest on. POST /api/selfeval answers all of them, scores three ways, grades with the existing Critic, and keeps a trend. scripts/selfeval-loop.mjs runs it on a schedule and writes docs/selfeval.md.
Stated plainly because it would be easy to overclaim: **no weights change and nothing is trained.** What the loop does is turn "can Orbit answer questions" from an opinion into a number, and name exactly which questions it failed, so a change either moves that number or it did not.
Score went 54.2% -> 87.5% -> 95.8% -> 100% in four rounds, and every step came from a failure the harness found:
  1. All four out-of-scope questions leaked. rank() always appended the ledger fact, so the relevant list was never empty and the agent never refused anything — it answered "what will be on the midterm" confidently. Named subjects (grades, exam content, weather, life advice) are now refused before retrieval, because relying on "no fact matched" does not work when "should I drop out" shares the word drop with the cut suggestions.
  2. Four correct answers were flagged ungrounded. The verifier read the 4 in "Problem Set 4" and the 61 in "the 61B" as invented claims. Numbers printed in a fact are now licensed by it.
  3. Three questions were answered from the wrong facts: no stemming (so "estimates" never matched "estimate"), no route for "due soonest", and "on time" making "time" a question word that matches "times" in every calibration fact — which is how a bus question got answered out of the estimator history.
  4. A question passed while burying the answer third. satisfies() only asked that the right fact appear somewhere, so leadsWith() now requires it in the first two. It immediately found another one.
One weakness the tests found and fixed: verification was scoped to the whole factsheet, so "you have 340 usable minutes" was licensed by an unrelated fact mentioning 340 XP. It is now scoped to the facts the answer was actually shown.
Affects: src/core/questionBank.ts, src/app/api/selfeval, scripts/selfeval-loop.mjs, docs/selfeval.md.

## 2026-09-19 19:15 ET · Adi + lead Claude · Orbit greets you by name
Decision: The page header reads "Hey Adi! Welcome to your Orbit", and the spoken opening briefing now starts "Hey Adi." The name comes from the store (ORBIT_USER_NAME, defaulting to Adi) rather than being written into either surface, so the page and the voice cannot drift apart. The leaderboard's own row says the name too instead of "You".
Why: It was a cold open — a product called Orbit that greeted you with "Orbit". Putting the name in the server-composed briefing is also the only way a name reaches speech without trusting the model to remember one, which is the same rule every other number follows.
Note for whoever restarts next: store() backfills missing keys but never overwrites an existing value, so changing a seeded value needs a reset. That wipes an imported calendar, which is why this was done in one pass with the Canvas re-import.
Affects: src/app/TodayClient.tsx, src/agents/voiceTools.ts, src/lib/store.ts, .env.example.

## 2026-09-19 19:30 ET · Adi + lead Claude · The spoken opening is composed per call, not baked into the agent
Decision: New openingGreeting() in voiceTools composes a short, warm opening from the real day, returned by /api/voice/token as `greeting` and passed to ElevenLabs as overrides.agent.firstMessage. Enabled first_message overrides on the agent (platform_settings.overrides.conversation_config_override.agent.first_message = true). The static FIRST_MESSAGE is now a welcoming fallback rather than a transactional one, for the case where overrides are off.
Why: Adi said he never heard the greeting, and he was right — the "Hey Adi" I added went into openingBriefing(), which is only rendered as text on the page. What a caller actually hears is the agent's static first_message, which cannot know a student's name or their day. Overriding it per call is the only way a name and a real number reach the spoken opening, and it keeps the rule that the server writes any sentence containing a figure.
Tone: deliberately not the full briefing. The briefing is the honest accounting and belongs on the page and in the answer to "what does my day look like"; opening a conversation with a paragraph of arithmetic is not a welcome. The greeting is one warm line, one true number, and the turn handed straight back. Crisis mode gets its own opening that leads with nothing counting against you.
Also: dropped an em dash from the greeting. It is a good pause on the page and a coin toss in text-to-speech.
Affects: src/agents/voiceTools.ts, src/app/api/voice/token/route.ts, src/app/VoiceButton.tsx, scripts/voice-config.mjs, the agent's override settings.

## 2026-09-19 19:05 ET · Adi + lead Claude · The day moves with the clock
Decision: findGaps takes an optional `now` and clipToNow drops windows that have already gone and shortens the one under way to what is actually left. buildToday resolves the clock before building the windows and passes it. A clipped window keeps the id derived from its *planned* start, and carries plannedStart and inProgress.
Why: Adi looked at it at 18:58 and the app was still offering "your best window is eleven oh five to two twenty-one, three hours sixteen" — a window that had closed five hours earlier, with a task placed in it. The clock itself was right and the bus was live; the plan was written at wake and never touched again. Every number had been correct that morning, which is the worst kind of wrong, because it looks exactly like the truth.
The id has to stay on the planned start. A window that shrinks by a minute every minute is still the same window, and if its id moved with the clock the Watcher would see one close and another open on every tick — the same class of bug as the positional ids fixed this afternoon, arriving from the other direction.
Second consequence, handled: an in-progress window now loses a minute every minute, and the Watcher's shrink threshold is five, so it would have announced "your window lost six minutes" roughly every six minutes for ever. The diff now subtracts elapsed time for in-progress windows and only reports what is left over, saying in the evidence how much was just the clock. Time passing is not an event.
Affects: src/core/gaps.ts, src/lib/today.ts, src/agents/watcher.ts, src/core/__tests__/clip.test.ts, watcher tests.

## 2026-09-19 19:20 ET · Adi + lead Claude · Orbit talks like someone who keeps your diary, not a stopwatch
Decision: New pure src/core/say.ts with naturalDuration, naturalClock, partOfDay, greetingWord, countThings and naturalDue. The opening and get_today are rewritten around them, and the system prompt tells the model to lead with what matters rather than the measurement.
  Before: "You have four hours forty-four clear from seven o'clock, which is more than it looks like from your calendar."
  After: "Evening, Adi. You have the rest of tonight, and you are winding down around midnight. Eight things still on your list. I would start with Problem Set 4, it is due tomorrow, and it runs about two and a half hours the way you actually work. Shall I set you up with that?"
Why: Adi's words — nobody who knew your schedule would read you a stopwatch. They would say what is left, when you are stopping, and which one they would start. The ledger arithmetic is the *reason behind* the answer, not the answer; it stays on the screen and one question away in `why`, and it still leads when the day genuinely does not fit.
What did not change: the server still composes every sentence containing a number, which is what makes an invented figure structurally impossible. Softening is about phrasing, never about precision where precision matters — durations and wind-down times round and are hedged with "about", while bus leave-by times, class starts and logged minutes stay exact. Round a leave-by and somebody misses a bus.
Two bugs the rewrite surfaced: the recommendation was quoting the *raw* estimate while claiming "the way you actually work" (Problem Set 4 is 90 raw and 144 calibrated, so it was saying an hour and a half instead of two and a half), and the greeting was not passing through asSentence, so it read "... list. eight things ...".
Affects: src/core/say.ts, src/agents/voiceTools.ts, scripts/voice-config.mjs, src/core/__tests__/say.test.ts.

## 2026-09-19 19:10 ET · Adi + lead Claude · /api/today gains `blocks`: the day itself, with status decided server-side
Decision: buildToday() now returns `blocks` — every FixedBlock ordered by start, each with startText, endText, minutes, kind, courseCode, place, and a server-computed `status` of done | now | next | later plus `progress` (0..1) and `remainingMinutes` while one is running. Additive: the `Today` type in TodayClient.tsx is structural and ignores it, so the web page is untouched.
Why: The iOS timeline needs the classes, and until now the only thing the API exposed about them was their consequences (gaps, ledger.fixed, the bus leg). The status had to come from the server rather than the phone for a reason that is not stylistic: clock() may be the simulated demo clock, so a device asking Date() during a rehearsal would mark the 2:30 seminar finished at seven in the evening and the deck would disagree with every other number on the screen. Verified against the running server: 589 usable vs 815 naive, and all three classes correctly `done` at 19:07.
Affects: src/lib/today.ts, ios/Orbit/Models/Today.swift, ios/Orbit/Today/ScheduleOverviewView.swift. npx tsc --noEmit clean, 161 tests pass.

## 2026-09-19 19:10 ET · Adi + lead Claude · iOS design tokens live in Color+Theme.swift until docs/theme.md exists
Decision: One token file, ios/Orbit/Theme/Color+Theme.swift: deep cosmic charcoal #0B0D17 / polar white #F8F9FA backgrounds, cosmic indigo #4F46E5 (light) and nebula blue #6366F1 (dark) as the primary accent, solar amber #F59E0B for urgency and electric violet #A855F7 for live state, rounded system faces throughout. Every token is a dynamic UIColor resolved per trait collection, so there is no asset catalog and no colorScheme read in a view body.
Two honest notes. The brief gives three accent hues and Orbit has four domains (learn, build, body, life); the fourth is teal #2DD4BF, chosen because it is the remaining hue that stays distinguishable from indigo, violet and amber under the common forms of colour blindness. And amber and violet at their stated values do not clear contrast on white, so light mode uses #B45309 and #7E22CE for text and strokes.
Why: anmol-ios.md says to use system colours until Akshat publishes docs/theme.md, and DECISIONS already records that a real dark theme belongs in that file rather than in a panic. This does not pre-empt it: the hex values sit in one file with nothing else in the app hard-coding a colour, so reconciling with docs/theme.md is an edit to OrbitToken and nowhere else.
Affects: ios/Orbit/Theme/Color+Theme.swift, every iOS view, docs/theme.md when it lands.

## 2026-09-19 19:10 ET · Adi + lead Claude · Where the iOS app is allowed to be expensive, and the swipe action we did not fake
Decision: Three rules, written down in ios/PERFORMANCE.md. (1) Materials only on surfaces that do not scroll — the docked bar, the nav bar, the toast, the expanded class, and exactly one card, the one in progress. Every other card is an opaque fill with a gradient and a lit edge, which reads as glass and costs one blend instead of a blur pass per frame. (2) Shadows are ShapeStyle.shadow(.drop) inside the fill, not the .shadow() view modifier, which rasterises its subtree offscreen. (3) Today is a List rather than ScrollView + LazyVStack: List is lazy in the same way and is the only container that gives system-tuned swipe actions. The deck is a LazyHStack.
Separately: the brief asked for swipe actions for attendance, adding assignments and muting notifications. There are no endpoints for any of those, so they are not built. Swipe-to-Done posts to /api/complete and is real. The trailing "Not now" hides a suggestion on the device only, is commented as such, and comes back on refresh — inventing a server effect would have put the phone and the web page in disagreement, which is the one thing this client exists not to do.
Affects: ios/PERFORMANCE.md, ios/Orbit/Components/*, ios/Orbit/Today/*.

## 2026-09-19 19:40 ET · Adi + lead Claude · Two iOS tokens failed contrast and were corrected
Decision: orbitInkFaint was 0x9CA3AF on white (2.5:1) and 0x6B7280 on the dark surface (3.6:1) — both below 4.5:1, and it is the colour every caption, timestamp and secondary label uses. It is now 0x6B7280 light (4.9:1) and 0x8A93A6 dark (5.7:1). orbitAccent in dark mode moves from nebula blue 0x6366F1 (4.35:1 as small text on the charcoal ground) to 0x818CF8 (5.9:1); fills, gradients and the CTA keep 0x6366F1, where white sits on it rather than it sitting on the ground.
Why: caught while drawing the design preview and checking every pair. The brief specified these hexes for surfaces and fills, where they are fine; as small text on their own ground two of them are not. Same class of correction already recorded for amber and violet in light mode.
Affects: ios/Orbit/Theme/Color+Theme.swift.

## 2026-09-19 19:45 ET · Adi · iOS keeps the celestial palette; docs/theme.md governs the web
Decision: docs/theme.md landed at 19:30 with a full token set (accent #0B6FA8 / #5AA9DC, ground #F6F6F4 / #12141A, domains blue / gold / pink / green, contrast and deuteranopia distances all checked). It does not match the palette the iOS app was specified with (cosmic indigo #4F46E5 / #6366F1, charcoal #0B0D17, domains indigo / violet / amber / teal). Asked which wins for iOS; Adi chose to keep the celestial palette. The web app follows docs/theme.md, the iOS app does not, and that is intentional rather than drift.
Consequence, stated plainly so nobody has to rediscover it: the two surfaces will not look like the same product, and both are in the demo. Every colour on iOS lives in ios/Orbit/Theme/Color+Theme.swift, so reversing this later is one file.
One rule still open: theme.md says "There is no colour for the user doing badly. No red on a low score, no amber on a missed task." The iOS ledger header shows an amber "9h 20m over" pill when the day is over-committed, which is that pattern. It stays for now because the palette decision kept amber as the urgency colour, but it is a product rule rather than a palette one, and Akshat's session should overrule it here if it disagrees.
Affects: ios/Orbit/Theme/Color+Theme.swift, ios/README.md, ios/Orbit/Components/TimelineHeaderView.swift, docs/theme.md (no change).

## 2026-09-19 20:05 ET · Adi · The iOS app takes the Homely visual language, and gets a motion system
Decision: Adi pointed at Varti Studio's "Homely" smart-home concept on Behance and asked the iOS app to look like it. Adopted, replacing the celestial palette decided at 19:45 (which replaced docs/theme.md at 19:10 — this is the third and, at T-14h, the last). What was taken is the language, not the artwork: a true near-black ground #070708 instead of navy, a warm bone #EFEDE8 light mode instead of cool white, one acid-lime #D4F34A accent, a tight grotesque instead of SF Rounded, tiles at 26pt radius, circular mode chips, a radiating tick dial, and a floating dock instead of a full-width bar. No Varti layout or asset is reproduced.
The rule that makes it work is scarcity: **lime appears on exactly three things** — the class happening now, the selected mode chip, and the primary action in the dock. It is written at the top of ScheduleOverviewView and in ios/README.md because it is the first thing that will erode.
Two things fell out of it that are worth having on their own:
  1. The live class tile was a frosted `.ultraThinMaterial` card inside a horizontally scrolling deck, which is a live blur re-sampled every frame of every scroll. In this design it is a flat lime fill. **There is now no blur anywhere in scrolling content** — the app has two materials total, the dock and the toast, and neither moves.
  2. The ledger ring became RadialDialView: 56 ticks drawn as one Path inside one Shape, animated through `animatableData`, so the sweep is interpolated on the render thread instead of rebuilding a body. One view, not 56.
New file ios/Orbit/Theme/OrbitMotion.swift holds every spring, curve, stagger and delay, plus the press style, the staggered entrance and the bloom. Reduce Motion is honoured there and returns `Animation?` = nil rather than a zero-duration animation, so no call site can forget it and OrbitBloom never constructs its PhaseAnimator at all. CircularProgressRing.swift deleted, superseded.
Affects: ios/Orbit/Theme/*, ios/Orbit/Components/*, ios/Orbit/Today/*, ios/PERFORMANCE.md, ios/README.md. Not compiled — no Xcode on the Windows box; Anmol builds it on the Mac.

## 2026-09-19 19:40 ET · lead Claude · Final test caught the greeting regressing on every agent rebuild
Decision: setup-voice-agent.mjs now sets platform_settings.overrides.conversation_config_override.agent.first_message = true at create time. Enabled it on the live agent and deleted the two orphan agents left behind by earlier rebuilds; registry is one agent and nine tools with no duplicates and no orphans.
Why: Registering `ask` and `why` recreated the agent, and a new agent defaults first_message overrides to **false**. The per-call greeting is sent as exactly that override, so it would have been silently ignored and the static line played instead — the precise bug Adi reported an hour earlier, reintroduced by the fix for something else. Silently, because an ignored override is not an error. It was only caught because the final pass checked the agent's settings rather than assuming the last PATCH still held.
Affects: scripts/setup-voice-agent.mjs, the ElevenLabs workspace.

## 2026-09-19 20:20 ET · Adi + lead Claude · Bus: read the third feed, predict per trip, and say how much to trust it
Decision: Four changes to the transit layer, all found by reading the live PRT feeds rather than the code.
  1. **Service alerts.** New src/services/alerts.ts reads gtfsrt-bus/alerts, the feed we were not using. Three alerts touch route 61 right now, including "Temp. Stop Move: Forbes & Bouqet" — the exact Oakland corner the demo walks to. PRT files 19 of 24 alerts as UNKNOWN_EFFECT and puts the meaning in the title, so classification reads the text when the enum will not. Surfaced above the itinerary on the map and spoken by get_bus, stop moves first.
  2. **Per-trip ride time.** The trip-update feed predicts every stop on a trip, six to twenty-nine of them, and we were reading only the boarding stop and then applying one static scheduled ride to every bus. So a 61C twelve minutes down got the same ride as an on-time 61D, and delay accumulated during the ride was invisible. Rides now vary per trip: 10, 13, 13, 13 where all four used to read 13.
  3. **A clamp on the feed.** A live ride is accepted only between half and two and a half times the scheduled one. The feed offered a six-minute ride where the timetable says thirteen; on a fixed route through Oakland that is a stale or mid-route prediction, not a fast bus. Same shape as the estimator's clamp: the feed may correct the schedule, it may not contradict it.
  4. **Confidence per departure.** high / medium / low from whether a vehicle is reporting, how fresh its fix is, how close it is, and whether both ends of the ride are predicted. Shown as "confident / rough / timetable only", and the voice says so when it is reading a timetable rather than a prediction.
Also: walking legs are cached. They run between fixed points so the answer never changes, and every journey was spending two Google Routes calls re-deriving the same 193 metres. Journey now answers in 9-18 ms.
Why this matters more than a nicer map: a delay makes an answer late, a stop move makes it false, and no amount of arrival prediction saves a student standing at the wrong pole.
Affects: src/services/alerts.ts, src/lib/journey.ts, src/agents/voiceTools.ts, src/app/map/MapClient.tsx, src/core/__tests__/transit.test.ts.

## 2026-09-19 20:50 ET · Adi + lead Claude · Transit is demand-driven, destination-aware, and no longer hardcodes EDT
Decision: Four changes.
  1. **Demand-driven.** New pure src/core/transitRelevance.ts decides whether a bus is worth working out: a class inside the lead time, the way home for two hours after the last one, or an explicit destination, which always wins. Everything else touches no feed at all. Idle /api/today went from fetching three protobuf feeds and solving a route to 8 ms.
  2. **Destination-aware.** GET /api/transit/places lists where you can ask to go and what Orbit would pick unasked, and costs nothing — no feed is fetched to establish that the answer is "no bus right now". buildToday takes a `to` so an explicit pick overrides the class.
  3. **Durations past an hour say hours.** compactDuration for screens ("1h 15m") and naturalDuration for speech. "Leave in 75 min" and "ride 94 min" are arithmetic handed to someone glancing at a phone while walking.
  4. **The DST bug.** -04:00 was hardcoded in the demo clock and in the Canvas day boundary. That is EDT; Pittsburgh is EST from 2 November, at which point pinned demo times are an hour out and a task due after 23:00 lands on the wrong day. Both now use tzOffsetMinutes for that instant — a helper the codebase already had and these two places ignored.
Why demand-driven matters beyond cost: a bus card on a screen at four in the afternoon with nothing on until Thursday is not information, and polling a public agency's servers to discover that nothing is happening is rude as well as slow.
Also recorded, still open: NO_SERVICE alerts are detected but do not yet remove a route from the options; there are no transfers, so a single-leg trip is assumed; stop selection is hardcoded per building rather than chosen by what actually serves the destination.
Affects: src/core/transitRelevance.ts, src/lib/today.ts, src/app/api/transit/places, src/core/say.ts, src/services/prt.ts, src/app/api/import/route.ts, src/app/map/MapClient.tsx, src/agents/voiceTools.ts.

## 2026-09-19 21:10 ET · Adi + lead Claude · The four open transit bugs, each with the engineering call behind it
Decision:
  1. **Stops are chosen from the data.** New bestStopPair / routesBetween / stopsNear in schedule.ts resolve any two coordinates to the stop pair a single trip actually serves in that order. Direction is *proved* by the trip's own stop sequence, not asserted by a stop's name — "outbound" is only outbound relative to somewhere, and a test pins that reversing a served pair returns nothing. The hardcoded BUILDINGS table stays as a fallback when nothing is within walking distance. Verified across four pairs: Benedum boards at Bouquet, Cathedral at Bigelow, Home at Shady, and the alight stop differs by destination.
  2. **NO_SERVICE demotes, it does not delete.** A route PRT calls out of service is marked `suspended`, sorted behind everything running, and never recommended. Deleting it would make a student's usual bus vanish with no reason given, and if the alert is stale they have lost an option they can see with their own eyes at the stop. Keep it visible, keep the reason attached, never recommend it.
  3. **Transfers: say so, do not fake it.** Building a multi-leg router tonight would be reckless, and returning "no bus" when the truth is "no bus without changing" is the kind of wrong that sends somebody walking for an hour. Journey now reports `noDirectRoute` so a client can say which it is. The honest limitation beats a rushed router.
  4. **Polling matches how fast the answer changes.** The map refreshed every fifteen seconds regardless — in a hidden tab, and for a timetable-only departure an hour out. Now: nothing while hidden, 15 s when a bus is live and inside twenty minutes, 30 s when live but further out, 60 s for timetable only, and an immediate catch-up when the tab comes back.
Two bugs found while fixing these: the polling effect depended on the state its own fetch sets, so every load tore down and rebuilt the timer — moved to a ref. And bestStopPair defaulted to a three-hour window from fromSec 0, which is midnight to 3 a.m. and empty for every pair on the network; "is this pair served today" is a different question from "is there one in the next three hours", so the default is now the service day.
Affects: src/services/schedule.ts, src/lib/journey.ts, src/app/map/MapClient.tsx, src/core/__tests__/stops.test.ts.

## 2026-09-19 21:45 ET · Adi + lead Claude · Orbit moves to Jersey City and Stevens; Pittsburgh stays in the box
Decision: ORBIT_REGION selects the city, defaulting to `hudson`. New scripts/gtfs-extract-hudson.mjs builds data/njt-hudson.json — Hudson-Bergen Light Rail out of NJ Transit's rail GTFS plus the PATH routes that reach Hoboken — in the same schema as the Pittsburgh slice, so nothing downstream knows the difference. Places are now Stevens on Castle Point with home in downtown Jersey City; the seeded day is FE 570, FE 621 and MGT 808, all in Babbio, which matches the real Canvas feed.
Why now: Adi's Canvas feed is sit.instructure.com and his courses are FE and MGT. The entire transit layer was Pittsburgh, so every bus time the app showed him was for a city he does not live in.
Data sources, all public and keyless: njtransit.com/rail_data.zip, the Trillium PATH GTFS mirror, and panynj.gov/bin/portauthority/ridepath.json for live PATH departures. The honest gap: **NJ Transit's realtime needs a developer account we do not have**, so PATH is live and the light rail is a timetable, and the app reports which per departure rather than letting a schedule row look like a prediction. PATH live is kept beside the scheduled options rather than merged into them, because its board publishes no trip ids and there is no honest way to attach "4 min" to a particular timetable row.
Pittsburgh was kept rather than deleted. The transit regression suite is pinned to the Oakland slice — real stop ids, real ride times, a real weekday — and moving cities should not quietly throw away the only regression tests this layer has. vitest.config.mts pins the suite to oakland; the Hudson slice is covered separately in hudson.test.ts against its own data.
Two bugs found on the way. Realtime had to be region-gated: fetching the PRT feeds while planning a New Jersey journey succeeds, returns no matching trip ids, and the ghost rule then marks every Hudson departure "not on the live feed" — a green feed light and every train struck through. And filtering stops by name alone kept a GROVE STREET LIGHT RAIL STATION in Montclair, twenty kilometres away, which stopsNear() would have offered as somewhere to walk; stops are now dropped unless a kept trip serves them, pinned by a test that puts every stop inside Hudson County.
Verified live: Home to Babbio boards at Marin Boulevard after a nine minute walk, alights at Hoboken Terminal, and gives eighteen minutes uphill to Babbio, on HBLR every few minutes, reported as scheduled with medium or low confidence and no ghosts. PATH live at HOB returns real departures: WTC in zero and one minute, 33rd Street in three.
Affects: scripts/gtfs-extract-hudson.mjs, data/njt-hudson.json, src/services/schedule.ts, src/services/path.ts, src/lib/journey.ts, src/core/__tests__/fixture.ts, vitest.config.mts, docs/transit.md, docs/bus-map.md, .env.example.

## 2026-09-19 22:10 ET · Adi + lead Claude · Map structure taken from Nexus as ideas, reimplemented; nothing copied
Decision: Read github.com/KPandya1903/Nexus (Adi's own earlier project) for its map architecture and rebuilt the good parts in our stack as original code. Nothing was copied.
Why not copy: the repo carries **no licence** — public on GitHub grants viewing and forking, not use — and it was created 30 April 2026, nearly five months before the hackathon window. SteelHacks disqualifies code created before 11:00 on 19 September, and the sole exception is public open-source libraries, which an unlicensed personal repo is not. Authorship settles the copyright question and does not touch the eligibility one; this is the same rule that made us rebuild Orbit from the Swift version rather than reuse it. It is also Swift/MapKit against our Leaflet/TypeScript, so a literal copy would not have transferred.
What the structure gave us, all reimplemented: unselected options drawn faint rather than hidden (Nexus's selected / highlighted / dimmed marker states), an explicit recenter control, and a places list fetched rather than hardcoded.
The bug that structure exposed: fitBounds ran on every redraw, and the page polls — so panning to look at your stop, or zooming in on the bus, was undone a few seconds later by the next refresh. A map that fights the person holding it is worse than one that never moves. Framing now stops the moment they drag or zoom, and Recenter hands it back. Our own fitBounds is flagged so it is not mistaken for the user moving the map.
Three Pittsburgh leftovers on the map, found while doing this: the place dropdown was hardcoded Cathedral/Hillman/Posvar, the initial view was Pittsburgh coordinates, and the default destination was "Cathedral" — a building in the wrong state. All three now come from /api/transit/places, which also preselects what Orbit would have chosen unasked.
Affects: src/app/map/MapClient.tsx.

## 2026-09-19 22:30 ET · Adi + lead Claude · Basemap off CARTO; two bugs the screenshot showed
Decision: Three fixes from one screenshot.
  1. **Tiles.** CARTO's basemaps now require an API key and do not fail honestly about it — they return HTTP 200 with "API KEY REQUIRED" painted across every tile, so the map looks broken rather than unauthorised, which is why this was not caught by any status check. Switched to OpenStreetMap's own tiles, which need no key, with proper attribution. This is the web equivalent of what Nexus gets free from MapKit on iOS; MapKit itself has no browser build, so the keyless raster provider is the closest real tool.
  2. **"unknown place" across the map.** The map sends an empty `to` on its first render, before /api/transit/places has answered, and the journey route 400'd on it. Defaults now come from the region's own place list rather than Pittsburgh building names, an empty value means "you pick", and the client does not fetch until a destination exists.
  3. **"you miss it by 361 min".** The map keeps arriveBy in the URL, so at nine at night it was still measuring against a half past three class. Arithmetically true and useless. A deadline that has already passed is now dropped: there is nothing to be late for.
Affects: src/app/map/MapClient.tsx, src/app/api/transit/journey/route.ts.

## 2026-09-19 23:00 ET · Adi + lead Claude · Transit pass: one performance bug, four correctness bugs, and a production build
Decision: Adi asked whether this is the quality I would ship. It was not. Six things:
  1. **1.5 seconds a request.** Nothing in schedule.ts was indexed: every lookup scanned the whole departures array, and bestStopPair tries up to thirty-six stop pairs per request. Fifty-four thousand departures on the Hudson slice made that two million comparisons to answer "when is the next train". It was tolerable on Pittsburgh's smaller slice and hid there. Indexed by stop and by trip, built once at module load from immutable JSON. **1,543 ms -> 17 ms.**
  2. **"you make it" against nothing.** The verdict was computed as `true` whenever there was no deadline, so the map showed a green badge meaning nothing. verdict is now null when there is no class to be late for, and the type change made the compiler find all three call sites that assumed otherwise. Where there is no deadline the map shows door-to-door time instead, which is the number a person wanted anyway.
  3. **"HBLR hblr 8th street".** NJ Transit writes the route into its own headsign and we printed the route beside it. Stripped.
  4. **Door-to-door time did not exist.** Forty-four minutes was derivable from the response and in it nowhere, so no client could show the one number that answers "should I leave now".
  5. **The wait was invisible.** An itinerary that lists walk, ride, walk silently drops the time standing at the stop. Now shown when it is more than two minutes.
  6. **First production build.** `next build` had never been run. It passes: 24 routes, 2 static. Added Cache-Control to both transit endpoints -- private, ten seconds on the journey, which is under the client poll and every upstream TTL, so a burst of refreshes collapses without ever serving a stale bus.
Still not shipped-quality, and worth saying plainly: the Hudson slice is a 10.6 MB JSON parsed at module load, there is no rate limiting on any route, OSM's tile policy is fine for a demo and not for a user base, and the store is still in memory.
Affects: src/services/schedule.ts, src/lib/journey.ts, src/lib/today.ts, src/agents/voiceTools.ts, src/app/map/MapClient.tsx, src/app/api/transit/*.

## 2026-09-19 23:20 ET · Adi + lead Claude · The voice was reset to a default on every agent rebuild
Decision: voice_id now lives in scripts/voice-config.mjs (ELEVENLABS_VOICE_ID overrides it), so it is set at create time and re-applied by tune-voice. Set to George, the warm storyteller, which Adi chose. tune-voice --show prints it.
Why it was wrong: setup-voice-agent.mjs never set a voice, so ElevenLabs assigned its default — Eric — to each new agent. Registering a tool means recreating the agent, which I did three times tonight, and each time it silently overwrote whatever voice had been picked in the dashboard. Exactly the same class of regression as the first_message override: anything that must survive a rebuild has to live in the config file, not in the dashboard.
Checked while here, since Adi asked:
  - **No key has ever been pushed.** .env.local has never been committed, .gitignore covers .env*, and every tracked mention is a variable name or an error string. Nothing key-shaped anywhere in history.
  - **The key stays on the server.** /api/voice/token mints a short-lived conversation token with xi-api-key server-side; the browser receives a 1039-character JWT and never the key. No NEXT_PUBLIC_ ElevenLabs variable exists.
  - **The iOS app has no voice code at all.** ios/ is the Today screen, the map, components and theme — no ElevenLabs integration. So a voice heard while testing in Xcode came from the web app in the simulator's browser, hitting the same agent, which is why it had the same wrong voice.
Affects: scripts/voice-config.mjs, scripts/tune-voice.mjs, .env.example.
