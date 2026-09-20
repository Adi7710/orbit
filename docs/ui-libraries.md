# Libraries for UI animation and graphics: what is safe to add, and what each one buys us

Researched 20 September 2026, by Jatin. Every version, licence and React peer range
below was read from the npm registry on that date, not from a blog post. Nothing here
has been installed yet — this is the shortlist for Adi to approve or veto.

## The eligibility rule that shapes every pick

`CLAUDE.md` says all code must be written after 11:00 on 19 September, and
`DECISIONS.md` records the sole exception as **public open-source libraries** — the
same reasoning that made us rebuild the map structure from Nexus rather than copy it.
That draws a hard line through this space:

- **An npm dependency is safe.** It is a library, it lives in `node_modules`, it is not
  code in our tree, and the README already credits our tooling.
- **Copy-paste component kits are a grey area.** shadcn/ui, Magic UI (MIT, 22.3k stars)
  and Aceternity work by pasting *their source into your repository*. That is
  MIT-legal, but it puts code in our tree that none of us authored inside the window —
  precisely the distinction that ruled out Nexus. Authorship settles copyright; it does
  not settle eligibility. Avoid, or paste only as a reference and rewrite.

Two further house rules apply: `CLAUDE.md` requires **a line in `DECISIONS.md` for every
new dependency**, and nothing in the demo may depend on a key being present. None of the
libraries below need a key.

## Tier 1 — earns its place in the five locked beats

| Package | Version / licence | React 19 peer | What it buys us |
| --- | --- | --- | --- |
| [`@number-flow/react`](https://github.com/barvian/number-flow) | 0.6.2, MIT, 7.7k stars | `^18 \|\| ^19` | **Beat 1.** Replaces the hand-rolled `requestAnimationFrame` counter in `src/app/LedgerReveal.tsx` with a digit-rolling odometer. Dependency-free and accessible. The largest visual gain for the least new code, and it deletes code rather than adding it. |
| [`motion`](https://github.com/motiondivision/motion) | 13.4.0, MIT, 33.7k stars | `^18 \|\| ^19` | Framer Motion's successor, imported as `motion/react`. Layout transitions as proposals appear and resolve, card enter/exit, the ledger deduction choreography. |
| [`@radix-ui/react-dialog`](https://www.npmjs.com/package/@radix-ui/react-dialog) | 1.1.23, MIT | `^19` | Replaces the focus trap hand-written in `src/app/EmailModal.tsx`. Escape, backdrop, focus return and inert background are the primitive's job, not ours. |
| [`sonner`](https://www.npmjs.com/package/sonner) | 2.0.8, MIT | `^19` | **Beat 4.** Replaces the hand-rolled XP toast, including the timer race a second toast used to lose. Stacking, swipe to dismiss, promise states. |
| [`tw-animate-css`](https://github.com/Wombosvideo/tw-animate-css) | 1.4.0, MIT | CSS only | The **Tailwind v4** replacement for `tailwindcss-animate`. CSS-first, no JavaScript plugin system. We are on Tailwind 4, so the original plugin does not work here. |
| [`canvas-confetti`](https://www.npmjs.com/package/canvas-confetti) | 1.9.4, ISC | n/a | **Beat 4.** About 6 kB and one function call on the XP moment. The cheapest polish on this list. |

## Tier 2 — graphics for the screens that do not exist yet

| Package | Version / licence | Use |
| --- | --- | --- |
| [`recharts`](https://www.npmjs.com/package/recharts) | 3.10.1, MIT | **Beat 5, the eval table**, which currently has no page at all. Predicted-versus-actual scatter from `/api/eval` `detail[]`; calibration bars from `today.calibration`. React 19 has been supported since v3. |
| [`@visx/visx`](https://www.npmjs.com/package/@visx/visx) | 4.0.0, MIT | The critic radar — `/api/critic` returns four scores across eight event kinds. Recharts' radar is the weaker of the two. Heavier to learn, so only if the radar is wanted. |
| [`lucide-react`](https://www.npmjs.com/package/lucide-react) | 1.47.0, ISC | Replaces the emoji in the bus itinerary, which had to be marked `aria-hidden` because screen readers announce them as words. Tree-shakes per icon. |
| [`@formkit/auto-animate`](https://www.npmjs.com/package/@formkit/auto-animate) | 0.10.0, MIT | About 2 kB and one `useAutoAnimate()` ref: the proposals list animates as items are approved and declined. Nearly free. |
| [`embla-carousel-react`](https://www.npmjs.com/package/embla-carousel-react) | 8.6.0, MIT | Only if the gap cards become a swipeable row. |

## iOS

[**Pow**](https://github.com/EmergeTools/Pow) — MIT, 4.2k stars, Swift Package Manager, from
Moving Parts and Emerge Tools. SwiftUI transitions plus *change effects* that fire when a
value updates, which is exactly the XP toast and the calibration multiplier moving on
screen. Installing it is `File > Add Package`; it needs no project surgery, which matters
because `ios/Orbit.xcodeproj` uses a synchronized folder group. Apple's built-in **Swift
Charts** covers the graphs with no third-party dependency at all.

## Rejected, with reasons

- **`@tremor/react`** (3.18.7, Apache 2.0). Its React peer range is `^18.0.0` only, so it
  would need `--legacy-peer-deps` against our React 19. Not worth the install risk.
- **shadcn/ui, Magic UI, Aceternity UI.** Good work, MIT, but distributed by copy-paste.
  See the eligibility rule above.
- **GSAP.** Capable, but its current licence terms need checking by a human before we
  ship against them. Not recommended without that check.

## Recommendation

If we do only three: `@number-flow/react`, `canvas-confetti` and `tw-animate-css`. That is
beats 1 and 4 looking materially more finished for roughly thirty minutes of work, about
10 kB, no keys, no build-system risk, and three lines in `DECISIONS.md`.

`sonner` and `@radix-ui/react-dialog` are the next two, and they are the better pair on
principle: both **remove** hand-rolled code from `src/app/` rather than adding to it.

Everything in Tier 2 is worth building for the repository and the judges' reading of it,
but issue #23 locks the demo to five beats and explicitly cut the leaderboard page. Only
the eval table and the syllabus panel are inside that lock.
