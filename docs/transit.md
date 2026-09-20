# Transit: Jersey City → Stevens

> Orbit plans in **Hudson County** by default: home in Jersey City, classes at Stevens on Castle Point in Hoboken. Pittsburgh is still in the box, behind `ORBIT_REGION=oakland`.

## The commute

Jersey City to Stevens is two legs and a hill:

1. **Hudson-Bergen Light Rail or PATH** into Hoboken. Exchange Place, Harborside, Newport, Essex Street, Marin Boulevard and Jersey Avenue are all on the light rail; Grove Street, Newport, Exchange Place and Journal Square are on PATH.
2. **A walk up Castle Point.** Stevens sits above Hoboken Terminal — roughly eighteen minutes on foot to Babbio, more to the buildings at the top. That walk is measured, not assumed, and it is usually the longest single leg.

**Babbio matters more than the others.** The School of Business is on the waterfront at the bottom of the hill, and FE 570, FE 621 and MGT 808 all meet there — so it is a materially different walk from the terminal than Gateway or Burchard up on Castle Point.

## Where the data comes from, and what is missing

| Source | What | Key needed | Live? |
|---|---|---|---|
| [NJ Transit rail GTFS](https://www.njtransit.com/rail_data.zip) | Hudson-Bergen Light Rail timetable | no | **no** |
| [PATH GTFS (Trillium)](https://data.trilliumtransit.com/gtfs/path-nj-us/path-nj-us.zip) | PATH timetable | no | — |
| [RidePATH board](https://www.panynj.gov/bin/portauthority/ridepath.json) | PATH departures, seconds to arrival | no | **yes** |
| NJ Transit realtime | would cover the light rail | **yes, and we do not have one** | — |

That last row is the honest limitation and it shapes the whole feature:

> **PATH is live. The light rail is a timetable.** The app says which, per departure, rather than letting a schedule row look like a prediction.

This is a real downgrade from the Pittsburgh build, where PRT publishes trip updates, vehicle positions *and* service alerts openly. If an NJ Transit developer account appears, `src/services/prt.ts` is the shape to copy and the confidence rules already handle it.

PATH live is kept **beside** the scheduled options, never merged into them. PATH's board publishes no trip ids, so there is no honest way to attach "4 min" to a particular timetable row.

## Rebuilding the data

```
node scripts/gtfs-extract-hudson.mjs      # -> data/njt-hudson.json
node scripts/gtfs-extract.mjs             # -> data/prt-oakland.json (Pittsburgh)
```

The Hudson slice is 23 stops, 4 routes, ~55,000 departures, valid to March 2027. Only PATH routes that reach Hoboken are kept — Newark–WTC and the Harrison shuttle never do, and they were two thirds of the extract.

> **A bug worth remembering.** Stops were first filtered by name alone, which kept a `GROVE STREET LIGHT RAIL STATION` in **Montclair**, twenty kilometres from Jersey City. It had no departures, but `stopsNear()` would have offered it as somewhere to walk. Stops are now dropped unless a kept trip serves them, and a test pins every stop inside Hudson County.

## Switching regions

```
ORBIT_REGION=hudson    # default: Jersey City / Hoboken
ORBIT_REGION=oakland   # Pittsburgh / Pitt
```

One schema, two slices, so nothing downstream knows the difference. Pittsburgh was kept rather than deleted because the transit regression suite is pinned to it — real stop ids, real ride times, a real weekday — and moving cities should not quietly throw away the only regression tests this layer has. `vitest.config.mts` sets `ORBIT_REGION=oakland` for that reason; the Hudson slice is covered separately in `hudson.test.ts`, against its own data.

**Realtime is region-gated, and that is not cosmetic.** Fetching the PRT feeds while planning a New Jersey journey succeeds, returns no matching trip ids, and the ghost rule — feed is up, trip should have started, no update for it — then marks *every* Hudson departure "not on the live feed". A green feed light and every train struck through.

## What is still missing

- **No transfers.** Single-leg only. Journey reports `noDirectRoute` so a client can say "no direct train" rather than "no train", but Journal Square to Castle Point with a change is not planned.
- **No Stevens shuttle.** Stevens runs its own between the terminal and campus; it is not in any GTFS feed, so the uphill walk is what Orbit offers.
- **No service alerts in Hudson.** PRT publishes them openly; NJ Transit does not. The alert plumbing exists and is wired for Pittsburgh only.
- **Light rail arrival times are scheduled**, with confidence reported as `medium` or `low` accordingly. Nothing pretends otherwise.

## The map on iOS

The web map is Leaflet. **Do not port it.** SwiftUI has MapKit, which is free, native, hardware-accelerated and already knows how to draw a blue location dot — reimplementing that in a web view is how an iOS app ends up feeling like a website.

What transfers is the data, not the rendering. `/api/transit/journey` already returns everything a `Map` needs:

| Field | MapKit |
|---|---|
| `options[].shape` | `MapPolyline(coordinates:)` |
| `walkToStop.polyline`, `walkToDest.polyline` | `MapPolyline` with a dashed `StrokeStyle` |
| `boardStop`, `alightStop` | `Annotation` |
| `options[].callingAt` | small `Annotation` per stop, name and time |
| `options[].vehicle` | `Annotation`, rotate by `bearing` |
| `origin` / device location | `UserAnnotation()` |

Three things the web version learned the hard way, which the iOS one should not repeat:

1. **Do not re-frame the map on every refresh.** The journey polls. Setting the camera each time undoes the pan a student just made, and a map that fights the person holding it is worse than one that never moves. Track whether they moved it and offer a recenter control instead.
2. **Ask where they are going before asking for anything else.** Opening on a map and a timetable asks a student to work out what they are looking at. One question first means every number after it is an answer to something they said.
3. **Ask for location when they choose to use it, not on launch.** A permission prompt before the app has shown its worth is how people learn to tap Deny. `CLLocationManager.requestWhenInUseAuthorization()` belongs behind a "use my location" button, and the journey keeps working from home if they refuse.

Labels must be **permanent**, not tooltips. This screen is read at arm's length while walking.
