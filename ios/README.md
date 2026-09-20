# Orbit iOS

The SwiftUI client. It renders; it never computes a time. Every number comes from the server.

## Open it (Mac only)

`ios/Orbit/Orbit.xcodeproj` is committed. Open it and run — there is nothing to
set up. The server URL is baked into the project as `ORBIT_API_BASE` and points
at the live tunnel on Adi's machine; if the app says it cannot reach the server,
`git pull` (the tunnel rewrites the URL when it rotates) or run
`gh variable get ORBIT_API_BASE` and set that as the build setting.

The project is **generated from `ios/Orbit/project.yml` by XcodeGen**, which is
where the deployment target, the Info.plist keys and the Swift package live. You
only need XcodeGen (`brew install xcodegen`) to *change* the project — adding a
file, a setting or a dependency — and then:

```
cd ios/Orbit && xcodegen generate
```

Commit `project.yml` and the regenerated `.xcodeproj` together. Sources are
referenced in place, so `Theme/`, `Models/`, `Today/`, `Components/` and
`Voice/` stay where git already tracks them.

What is already set, so nobody has to rediscover it:

- **Deployment target iOS 17.0.** The code uses `@Observable`, `phaseAnimator`,
  `scrollTransition`, `sensoryFeedback` and two-parameter `onChange`.
- **Swift language mode 5** (`SWIFT_VERSION = 5.0`). Xcode 26 would default a
  new project to Swift 6; this client was written to Swift 5 concurrency rules.
- **`ORBIT_API_BASE`** is a build setting, read by the Info.plist as
  `$(ORBIT_API_BASE)`. Default `http://localhost:3123`. Point one build at the
  deployment without editing anything:
  `xcodebuild … ORBIT_API_BASE=https://your.vercel.app`
- **`NSAppTransportSecurity → NSAllowsArbitraryLoads`** is on, for the
  plain-HTTP dev server. **Remove it before any submission that uses the HTTPS
  URL** — it is one block in `project.yml`.
- `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription` and
  `NSLocalNetworkUsageDescription` (LiveKit probes the LAN for the fastest audio
  path) are set.

The root view is `ScheduleOverviewView()` — Today, the screen the demo runs on.
`JourneyMapView()` is the map; reach it from a tab or push it, and set it as
root only when you are working on the map itself.

There is no iPhone 15 Pro simulator on Xcode 26; use an **iPhone 17 Pro**.

## Run it

- Start the server: `npm run dev -- -p 3123` in the repo root.
- Xcode → any iPhone simulator → Run.
- **Simulator → Features → Location → Custom Location…** and enter `40.7196, -74.0430` (Home, Jersey City) to stand where a commuting student stands.
- The map should show you, Marin Boulevard station, the next Hudson-Bergen Light Rail to Hoboken Terminal (a timetable, marked as such), the calling points, and the walk up to Babbio, with the verdict at the top of the sheet. Pittsburgh is still behind `ORBIT_REGION=oakland` on the server.

## What each file does

- `OrbitAPI.swift` — the actor that calls `GET /api/transit/journey`, plus `Codable` models that mirror the response exactly. If the server response shape changes, this file and `docs/bus-map.md` change together.
- `JourneyMapView.swift` — the map and the bottom sheet. MapKit, no key, no billing. Polls every 15 seconds while visible, stops when it disappears. Route polyline in PRT's colour, dashed walk lines, a bus pill rotated to its heading that glides between refreshes, and a verdict chip that is green, amber under five minutes of margin, red when you miss it.
- `OrbitAPI+Today.swift` — the Today half of the API: `/api/today`, `/api/plan`, `/api/proposals/{id}`, `/api/complete`, `/api/mode`. Separate file from `OrbitAPI.swift` so the map and Today can be edited by two people without colliding.
- `Models/Today.swift` — one `Codable` mirroring `GET /api/today`. Only the fields the app renders are declared; unknown keys decode fine, so the server may run ahead of the app.
- `Theme/Color+Theme.swift` — every colour, type style and metric in the app. Dynamic light/dark tokens, no asset catalog. The look is derived from the Homely concept by Varti Studio: true near-black ground, warm bone light mode, one acid-lime accent, a tight grotesque rather than a rounded face. It deliberately does **not** match `docs/theme.md`, which the web app follows. Do not retune it without asking Adi.

  **The accent budget.** Lime appears on exactly three things: the class happening now, the selected mode chip, and the primary action in the dock. That scarcity is the whole design. If you add a fourth, take it off one of the others.

  The rule generalises to sheets: lime is the primary action **of a surface**. A sheet covers the dock, so the sheet's own primary action — the voice orb, `CompleteSheet`'s "Log N minutes" — inherits the lime that "Plan my day" is no longer showing. Still one lime fill per surface. This is why the mic button in the dock is neutral.
- `Today/ScheduleOverviewView.swift` — Today. Ledger header, the class deck, the real windows with swipe-to-done, bus strip, quests, pending proposals, friends, and the docked quick bar.
- `Today/TodayStore.swift` — `@Observable` state: load, 30-second poll while visible, last-response cache with a visible banner when the server is unreachable, and the action calls.
- `Today/ClassDetailView.swift`, `Today/CompleteSheet.swift` — the expanded class (matched geometry from its card) and the "how long did it actually take?" sheet.
- `Components/` — `ClassCardView`, `TimelineHeaderView`, `RadialDialView`, `GapCardRow`, `BusStripView`, `GradientTagView`, `XPToastView`.
- `Theme/OrbitMotion.swift` — every spring, curve and stagger, plus the press style, the staggered entrance and the bloom. Reduce Motion is honoured here so no call site can forget it.
- `Voice/VoiceSession.swift` — the call, as state a view can draw. Push to talk: the session stays connected and the microphone is muted between turns, open only while a finger is down. Wraps the ElevenLabs SDK; `onAgentActed` reloads Today after every agent turn. With no token it holds the server's reason and the briefing instead, and `AVSpeechSynthesizer` will read that out.
- `Voice/VoiceSheetView.swift` — the sheet. Short on purpose (420pt) with background interaction on, so the ledger and the mode chips stay visible above it: saying "I'm in crisis mode" has to visibly change the day while the agent is still speaking, and a full-screen voice UI would hide the only proof anything happened.
- `Components/VoiceOrbView.swift` — hold-to-talk, and the thing that shows it is hearing you. One object doing both jobs, because the sheet gets one lime element and that is it.
- `App/OrbitApp.swift` — `@main`, root view `ScheduleOverviewView()`.
- `UITests/TodayScreens.swift` — drives the screen and photographs it. Not really a test suite: macOS blocks scripted input to the Simulator without accessibility permission, so this is how the app gets scrolled, tapped and swiped during a build check, and how the PR screenshots are taken. `xcodebuild … test`, then `xcrun xcresulttool export attachments --path … --output-path …`.
- `PERFORMANCE.md` — where the frames go on this screen and what the code does about it. Read it before adding a blur or a shadow.

## Next screens (issue #13, #14)

Leaderboard tab. Same pattern: one `Codable` per endpoint, no arithmetic in the view.

## Voice

Swift package `ElevenLabs` 3.3.1 (pulls LiveKit and two WebRTC xcframeworks) —
the only third-party code in the app. Networking is still `URLSession`.

`GET /api/voice/token` mints the conversation token; the ElevenLabs API key
never reaches the phone. The server also composes the `greeting`, which is
passed as `firstMessage` so the spoken opening can use the student's name and a
real number — see DECISIONS, 19 Sept 19:30.

**Voice is off without keys, and says so.** With no `ELEVENLABS_API_KEY` the
endpoint returns `token: null` with a reason; the sheet prints that reason, shows
the full briefing, and offers to read it aloud on the device. That path is the
one verified on this Mac — a live call needs a key. The live states were checked
through a DEBUG-only launch argument (`-orbit-voice-preview`) that the UI tests
pass; the gesture, the state machine and every view are the real ones, only the
transport is stubbed.

## Google Maps instead of MapKit

Not needed. MapKit requires no key. If the team wants Google tiles: add the `GoogleMaps` Swift package, create a Google Cloud key with **Maps SDK for iOS** enabled, and set `GOOGLE_MAPS_API_KEY` on the server too so walking legs come from the Routes API. The journey response is identical either way; only `walkToStop.source` changes from `estimate` to `google`.
