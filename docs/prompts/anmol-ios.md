# Prompt for Anmol's Claude: the Orbit iOS app

Paste everything below this line into your Claude session, in the repo root, after `git pull`.

---

You are building the iOS client for Orbit at SteelHacks XIII. Read `CLAUDE.md` and `DECISIONS.md` first and obey them; the hackathon rules there are not optional. You are Anmol's session. Anmol owns the iOS app; the web app and API already exist and are the source of truth.

## Mission
A SwiftUI app in `ios/Orbit/` (create the Xcode project there) that makes Orbit feel like a game you open between classes: the honest ledger, today's gaps as quest cards, the bus leave-by, friends free with you, the Tower leaderboard, and a big approve button for whatever the agent proposed. It talks to the same HTTP API the web app uses. It must be demoable on the simulator on the Mac and on a real iPhone by Sunday 10:00 AM.

## Absolute constraint
Do not open, read, or copy any earlier Orbit Swift code, including anything called OrbitCore, CapacityLedger, GapFinder, or ICSParser. All arithmetic lives on the server now. If you find yourself writing a capacity calculation in Swift, stop: call `/api/today` instead. Every line you write must be new, today.

## API contract (already live)
Base URL from `Info.plist` key `ORBIT_API_BASE` (default `http://localhost:3123`, later the Vercel URL). All JSON.
- `GET /api/today` → `{ mode, user{name,xpWeek,streakWeeks,group}, ledger{usable,naiveFree,travel,meals,routines,fixed,queued,slack,overCommitted}, gaps[{id,startText,endText,usable,fromPlace,isEvening,pick{id,title,estimateMinutes}|null}], quests[{id,title,xp,kind,expiresText}], bus{route,leaveByText,arrivalText,ghost}|null, arrivals[{route,text,realtime}], shared[{startText,endText,minutes,names[]}], tasks[...], proposals[{id,status,proposal{kind,reason,body?,to?,building?,message?}}], calibration[{key,samples,multiplier}], events[{seq,ts,actor,type}] }`
- `POST /api/plan` → `{ proposals[], narration, provider }`
- `POST /api/proposals/{id}` body `{ "decision": "approve" | "decline" }` → `{ ok, status, effect }`
- `POST /api/complete` body `{ taskId, actualMinutes }` → `{ ok, xp, reasons[], planned, multiplier }`
- `POST /api/mode` body `{ mode }`
- `GET /api/leaderboard?group=Tower%20A` → `{ rows[{rank,name,xpWeek,streakWeeks,group}] }`
- `GET /api/voice/token` → `{ token|null, briefing }`
Write Codable models that match these exactly. If a field is missing on the server, do not invent it; add a line to DECISIONS.md and ask Jatin's session via the issue.

## Screens, in build order
1. **Today** (the whole demo lives here): ledger header with the real number large and the calendar number struck through, plus a one-line "missing N minutes = walking + meals + settling" breakdown. Below it, gap cards: time range, usable minutes, the one task picked, a Done button that asks for actual minutes and posts to `/api/complete`, then shows an XP toast listing the reasons. A bus strip: "Leave by 13:16 · 71B live". A "Free with you" row of friend chips. A mode segmented control (normal / crisis / chill) that posts to `/api/mode`; crisis should visibly dim non-coursework.
2. **Proposals sheet**: after tapping "Plan my day" (POST /api/plan), show each proposal as a card with the reason; extension emails show the drafted body in a monospaced block. Approve and Decline buttons. Show the returned `effect` as a toast.
3. **Leaderboard** tab: group picker, ranked list, XP and streak, your row highlighted.
4. **Voice** button on Today: use the ElevenLabs Swift SDK (Swift Package `ElevenLabs` from elevenlabs/elevenlabs-swift-sdk) with the conversation token from `/api/voice/token`. If the SDK integration is not working within 90 minutes, fall back to speaking the `briefing` text with AVSpeechSynthesizer and move on. Log that decision.

## Feel
This is a game, not a planner. Quest cards, not to-do rows. XP toasts with the reasons, streak flame next to the name, a ring that fills as usable minutes get used. Haptics on approve and on Done. Reduce Motion respected. Dark mode from the start. Use the design tokens Akshat's session publishes in `docs/theme.md` (ring colors per domain: learn, build, body, life); until that file exists, use system colors.

## Engineering rules
- iOS 17+, SwiftUI, async/await, `URLSession`, one `OrbitAPI` actor, `@Observable` view models. No third-party networking libraries.
- Handle: server unreachable (show cached last response with a banner), 409 on already-resolved proposal, empty gaps ("Nothing fits. Enjoy it.").
- Never compute XP or ledger numbers on the device.
- Commit after every screen. Branch `d/ios-today`, then `d/ios-proposals`, etc. Open a PR when a screen works on the simulator; include a screenshot in the PR.
- Every decision (SDK choice, fallback, layout change) → one entry in `DECISIONS.md`.

## Acceptance for the demo
On the simulator against the deployed URL: open Today, see 9h 49m vs 13h 35m, tap Plan my day, approve a proposal, see the effect toast, mark a task done with 100 minutes, see "+143 XP" with reasons, switch to crisis and watch the non-coursework cards fade. Record a 20-second screen capture and attach it to issue #13.
