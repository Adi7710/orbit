# Orbit iOS

The SwiftUI client. It renders; it never computes a time. Every number comes from the server.

## Set it up in Xcode (Mac only)

1. Xcode → **File → New → Project → iOS App**. Product Name `Orbit`, Interface **SwiftUI**, Language **Swift**, Storage **None**. Save it so the project sits at `ios/Orbit/` in this repo.
2. Drag `OrbitAPI.swift` and `JourneyMapView.swift` into the project (check "Copy items if needed" off; they are already in place).
3. In the target's **Info** tab add:
   - `ORBIT_API_BASE` (String) → `http://<your-laptop-ip>:3123` for the simulator against a dev server, or the Vercel URL once it is deployed.
   - `NSLocationWhenInUseUsageDescription` (String) → "Orbit uses your location to tell you when to leave for the bus."
4. For a plain-HTTP dev server, add **App Transport Security Settings → Allow Arbitrary Loads = YES** (development only; remove before any submission that uses the Vercel HTTPS URL).
5. Set the app's root view to `JourneyMapView()`.

## Run it

- Start the server: `npm run dev` in the repo root (port 3123).
- Xcode → any iPhone simulator → Run.
- **Simulator → Features → Location → Custom Location…** and enter `40.4372, -79.9230` (Squirrel Hill) to stand where a commuting student stands.
- The map should show you, the stop at Forbes + Shady, the live 61A or 61B moving toward it, the ride to Fifth + University, and the walk to the Cathedral, with the verdict at the top of the sheet.

## What each file does

- `OrbitAPI.swift` — the actor that calls `GET /api/transit/journey`, plus `Codable` models that mirror the response exactly. If the server response shape changes, this file and `docs/bus-map.md` change together.
- `JourneyMapView.swift` — the map and the bottom sheet. MapKit, no key, no billing. Polls every 15 seconds while visible, stops when it disappears. Route polyline in PRT's colour, dashed walk lines, a bus pill rotated to its heading that glides between refreshes, and a verdict chip that is green, amber under five minutes of margin, red when you miss it.

## Next screens (issue #13, #14)

Today (ledger, gaps, quests, XP), Proposals sheet, Leaderboard. Same pattern: one `Codable` per endpoint, no arithmetic in the view.

## Google Maps instead of MapKit

Not needed. MapKit requires no key. If the team wants Google tiles: add the `GoogleMaps` Swift package, create a Google Cloud key with **Maps SDK for iOS** enabled, and set `GOOGLE_MAPS_API_KEY` on the server too so walking legs come from the Routes API. The journey response is identical either way; only `walkToStop.source` changes from `estimate` to `google`.
