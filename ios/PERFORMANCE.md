# Keeping the Orbit iOS app at 120Hz

ProMotion gives you an 8.3 ms frame budget instead of 16.7 ms. Nothing below is
exotic; it is the short list of things that actually cost frames in a SwiftUI
app shaped like this one, and what this codebase does about each.

## 1. Blur is the expensive thing, and it is expensive per frame

A `Material` is a live blur of whatever is behind it. It is re-sampled every
frame the backdrop moves, so a material inside a scroll view is paid on every
frame of every scroll, times the number of cards on screen.

The rule in this app: **materials only on surfaces that do not move.**

| Surface | Treatment | Why |
| --- | --- | --- |
| Floating dock | `.ultraThinMaterial` | Fixed overlay, composited once |
| XP toast | `.regularMaterial` | Fixed, on screen for seconds |
| In-progress class tile | **No blur at all** | A flat lime fill — the accent carries it |
| Expanded class detail | Opaque surface | Flat paper; only the scrim composites |
| Every other tile | Opaque fill + 1pt hairline | Costs one blend |

There are exactly **two** materials in the whole app, and neither of them
moves. Adopting the Homely look paid for itself here: the old design frosted
the live card, which put a live blur inside a horizontally scrolling deck. The
new one makes that card a solid lime fill, so the deck has no blur in it at
all.

If you profile a scroll stutter, this is still the first place to look.

## 2. Draw shadows in the shape, not around the view

```swift
// Offscreen render pass per view.
.shadow(color: .black.opacity(0.18), radius: 10, y: 6)

// Drawn inline by the shape renderer. This is what the cards use.
RoundedRectangle(cornerRadius: 20, style: .continuous)
    .fill(Color.orbitSurface.shadow(.drop(color: .black.opacity(0.18), radius: 10, y: 6)))
```

`ShapeStyle.shadow(.drop(...))` and `.shadow(.inner(...))` (iOS 16+) are part of
the fill. The `.shadow()` **view** modifier rasterises the subtree offscreen
first. The visual result is nearly identical; the cost is not.

The same applies to `.blur()`, `.opacity()` on a large group, and
`.drawingGroup()` — all of them flatten a subtree into a texture.

## 3. `@Observable`, not `ObservableObject`

`TodayStore` is `@Observable`. SwiftUI records which individual properties a
view read while building its body and invalidates only the views that read the
one that changed.

With `@Published` on an `ObservableObject`, every mutation is one
`objectWillChange` and every view observing the object rebuilds. On this screen
that means showing the XP toast would rebuild the class deck, the gap list, the
bus strip and the header.

Concretely: a 30-second poll that returns an identical day re-renders nothing,
because no property a view reads actually changed.

## 4. Laziness, and where `List` beats `LazyVStack`

- The class deck is a `LazyHStack` inside a horizontal `ScrollView`. Cards are
  built as they approach the viewport.
- The main vertical container is a `List`, not `ScrollView` + `LazyVStack`.
  List is lazy in the same way *and* it is the only container that gives
  system-tuned `.swipeActions` with the right rubber-banding and haptics.
  Re-implementing swipe with a `DragGesture` costs more frames than `List` ever
  will.
- Give `ForEach` stable identity. Every model here is `Identifiable` on a server
  id. Never `ForEach(0..<n)` over live data: it re-creates rows on every insert
  and throws away the diff.

## 5. Animate things the compositor can do

Cheap (GPU, no layout pass): `opacity`, `scaleEffect`, `rotationEffect`,
`offset`, a `Shape.trim` change.

Expensive (re-runs layout on every frame): `frame`, `padding`, `spacing`,
anything that changes the size of a view its siblings depend on.

- `RadialDialView` draws all 56 ticks as one `Path` inside a single `Shape`, and animates through `animatableData` — SwiftUI interpolates the sweep on the render thread instead of re-running a body 56 times.
- `.scrollTransition` in the deck animates opacity and scale only.
- `OrbitAppear` staggers entrances with opacity and a 14pt offset. Both are
  composited, so a dozen tiles arriving in sequence is still one layout pass.
- The bloom is a `PhaseAnimator` on one shadow radius. Spend it on one element
  per screen; it is a shadow, and shadows are the other thing that rasterises.

## 5a. Motion lives in one file

Every spring, curve, stagger and delay is in `Theme/OrbitMotion.swift`. Two
reasons, and the second is the important one:

1. A motion language drifts if it is typed inline. Six `.spring(response:)`
   calls become six different springs within a week.
2. **Reduce Motion is honoured there, once.** `OrbitMotion.entrance(reduceMotion)`
   returns `Animation?` — `nil` when the setting is on. A nil animation means
   SwiftUI does not build an animation at all, which is meaningfully different
   from building one with zero duration. `OrbitBloom` goes further and never
   constructs the `PhaseAnimator` in the first place.

No call site decides this for itself, so no call site can forget it.

## 6. Text: measure once

- `monospacedDigit()` on every clock, duration and XP number. Proportional
  digits change width as the value ticks, which re-lays-out the row and can
  shove a whole `HStack` sideways mid-scroll.
- `.contentTransition(.numericText())` on the big ledger number gives the odometer
  roll for free without a layout change.
- `.fixedSize(horizontal: false, vertical: true)` on wrapping body text stops
  the "text grows by one line on second layout pass" flicker.
- `lineLimit` on anything fed by server strings. An unbounded `Text` in a fixed
  height card is a layout ambiguity waiting for a long course name.

## 7. Colour without an asset catalog

`Color.orbit(light:dark:)` builds one `UIColor` with a dynamic provider, so the
system resolves it per trait collection at draw time. The alternative —
reading `@Environment(\.colorScheme)` and branching in `body` — makes the
colour scheme a dependency of every view that uses a token, so every one of them
rebuilds on a light/dark transition.

## 8. Networking off the main thread, mutations on it

`OrbitAPI` is an `actor`; `TodayStore` is `@MainActor`. Decoding happens on the
actor, only the finished value crosses to the main actor. Nothing does
`DispatchQueue.main.async`, and nothing decodes JSON in a view body.

Polling lives in `.task { await store.pollWhileVisible() }`, so SwiftUI cancels
it the moment the view disappears. A `Timer` would keep firing — and keep
waking the radio — behind the map screen.

## 9. Things this app deliberately does not do

- **No arithmetic on times.** Status, progress, remaining minutes, XP, the
  ledger, leave-by: all server-computed. This is a correctness rule first
  (`clock()` may be the simulated demo clock, so `Date()` on the phone is wrong
  during a rehearsal), but it is also a performance rule: no view recomputes a
  schedule while laying out.
- **No `GeometryReader` in a cell.** It forces a second layout pass and resizes
  to fill. If you need a width, prefer a fixed one (`OrbitMetric.deckCardWidth`)
  or `containerRelativeFrame`.
- **No `AnyView`.** It erases the type SwiftUI uses to diff, so the whole
  subtree is rebuilt instead of updated. Use `@ViewBuilder` on a helper, which
  is what every section in `ScheduleOverviewView` does.

## How to actually check

1. Instruments → **Animation Hitches**. Target: zero hitches scrolling the day
   deck end to end. This is the real test, not eyeballing the simulator — the
   simulator does not have ProMotion and does not have the phone's GPU.
2. Xcode → Debug → **View Debugging → Rendering → Color Offscreen-Rendered**.
   Anything yellow in scrolling content is a shadow or blur that should be
   moved into a shape fill.
3. `Self._printChanges()` at the top of a suspect `body` prints why it
   re-rendered. If the deck prints on an XP toast, an observation boundary
   leaked.
4. Test on a real iPhone with ProMotion. The simulator will happily lie to you
   about all of this.
