# Bus map: design and contract

The bus feature is one screen that answers one question: **"If I stand up now, do I make it?"** Everything on the screen exists to make that answer believable at a glance.

## The screen (iOS first, web later)

Full-bleed map with a bottom sheet. Three states of the sheet: collapsed (one line), half (the timeline), full (all options).

**Map layer, bottom to top**
1. Base map. iOS: MapKit `Map` with `.standard(elevation: .flat)`; muted, so our layers read. Google Maps only if `GOOGLE_MAPS_API_KEY` exists and the team wants the Google look; MapKit needs no key and no billing.
2. Route polyline for the chosen option, in the route's PRT color (`routeColors` in the response), 4 pt, drawn from the **bus's current position** to the alight stop (the API already trims `shape` for you). The part already traveled is not drawn; the bus is always at the start of the line.
3. Walk polylines, dashed gray: you → board stop, alight stop → destination.
4. Pins: **You** (blue dot, system), **board stop** (circle with the stop's role: "Forbes + Bigelow"), **alight stop**, **destination** (building glyph with the class time).
5. **The bus**: a rounded pill with the route number, rotated to `bearing`, animated between refreshes (interpolate position over the 15 s until the next fetch so it moves instead of jumping). If `vehicle` is missing, show a ghosted pill at the board stop with "no live position".
6. Camera: fit you, the bus, and the alight stop with 24 pt padding; re-fit only when the bus leaves the frame.

**Bottom sheet, half state (the timeline)**
```
Leave by 14:10                         ● you make it, 57 min to spare
─────────────────────────────────────────────────────────────────
🚶 4 min   walk to Forbes + Shady
🚌 61B     departs 14:17  live · 5 min late      bus is 3.8 km away
🪑 16 min  ride to Fifth + University
🚶 2 min   walk to Cathedral
🎓 14:33   arrive · class at 15:30
```
Each row is one field from the API. The verdict line is green when `verdict.makesIt`, amber when the margin is under 5 minutes, red when false. The "Leave by" number counts down live in the collapsed state: "Leave in 6 min".

**Bottom sheet, full state**
The next four options as cards: route, departs (live or scheduled or ghost), leave by, arrive, verdict. Tap a card to make it the chosen option; the map re-draws for that bus. Ghost options are shown struck through with "should be on the road, not on the feed".

**Refresh**: poll `/api/transit/journey` every 15 s while the screen is visible; stop when backgrounded. Show "updated 12 s ago" in the sheet header. If `realtime.tripsOk` is false, label everything "scheduled" and say "PRT live feed unavailable"; never show a stale live time as live.

**Demo clock**: when `clock.simulated` is true, show a small "demo clock 13:10" chip on the map so nobody thinks the buses are live.

## The contract: `GET /api/transit/journey`

Query: `from` and `to` are building keys (`Cathedral`, `Hillman`, `Posvar`, `Sennott`, `Benedum`, `Home`). Optional `lat`, `lon` override the origin with the phone's location (Home → campus uses this; campus → Home uses the building). Optional `arriveBy=HH:MM`; when going to campus without it, the next class in that building is used.

Response (all times in seconds after midnight, Pittsburgh time; `*Text` fields are `HH:MM`):
```
clock        { ymd, sec, epoch, simulated, text }
origin       { lat, lon, label }
destination  { lat, lon, label, arriveBySec?, arriveByText? }
boardStop    { id, name, lat, lon }
alightStop   { id, name, lat, lon }
walkToStop   { minutes, meters, polyline: [[lat,lon]...], source: "google" | "estimate" }
walkToDest   { minutes, meters, polyline, source }
options[]    { route, headsign, tripId, dir,
               departsSec, departsText, scheduledText, status: "live"|"scheduled"|"ghost", delaySec?,
               vehicle?: { id, lat, lon, bearing?, ageSec, metersToStop },
               leaveBySec, leaveByText, rideMinutes, alightSec, arriveSec, arriveText,
               verdict: { makesIt, marginMin },
               shape: [[lat,lon]...] }      // from the bus (or board stop) to the alight stop
realtime     { tripsOk, vehiclesOk }
feedValid    boolean
routeColors  { "61B": "5f9ea0", ... }
```

## How the numbers are made (so the UI never recomputes them)
- Departure: PRT's own prediction for that trip at that stop when it exists (`status: live`, `delaySec` = live minus scheduled); otherwise the timetable.
- Leave by: departure minus walk minus 2 minutes buffer.
- Walk: Google Routes API walking (duration and polyline) when a key is present; otherwise straight-line distance × 1.3 at 80 m/min with a straight polyline.
- Ride: measured from the timetable for that trip between the two stops (61B Forbes + Shady to Fifth + University is 16 minutes right now).
- Arrive: departure + ride + walk to destination. Verdict compares it to the class start.
- Bus distance: along the route polyline from the bus to the board stop, not as the crow flies.
- Ghost: a scheduled trip that should have left its first stop over 3 minutes ago and has no trip update.

## Google Maps
Not required. If you want Google tiles or Google walking directions: create a key in Google Cloud with **Maps SDK for iOS** and **Routes API** enabled (the $200 monthly credit covers a hackathon many times over), put `GOOGLE_MAPS_API_KEY` in `.env.local` on the server for walking directions, and add the `GoogleMaps` Swift package to the iOS app for tiles. The API response is identical either way; only `walkToStop.source` changes.

## Failure modes handled
No live feed → scheduled times labeled as such. Vehicle without a trip id → no bus pin, times still correct. Bus already past the stop → option skipped. Sunday judging → demo clock. Phone location denied → origin defaults to the building.
