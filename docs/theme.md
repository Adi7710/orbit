# Theme

> `docs/theme.md` · Owner: Akshat (issue #15) · SteelHacks XIII
>
> Consumed by Anmol's SwiftUI client and by the web app. Every value here is final and copy-pasteable. If something you need isn't here, that's a bug in this file — say so on #15 rather than inventing a value.

---

## 1. The metaphor, and the one rule about it

Orbit is a day with gravity. Classes are fixed bodies you cannot move. Gaps are orbits you can use. Rings fill. Streaks are momentum. Crisis mode is reduced gravity.

**The metaphor lives in the visuals and never in the words.**

Rings, orbital motion and gravity carry the theme on screen. The copy stays flat and literal: *"You have 9h 49m."* *"Nothing fits. Enjoy it."* No gaps called "orbits", no focus called "burn", no streaks called "momentum" in any string a user reads.

Two reasons this is a hard rule. Honesty is the product, and plain words are what honesty sounds like — a ledger that says "you have nine hours forty-nine minutes" is more convincing than one that says "your orbital window is 589 units". And invented vocabulary is how this kind of app becomes cringe, which is the single thing the voice must never be.

---

## 2. Color

### 2.1 Ring domains

Four domains, fixed in the type system as `learn | build | body | life`.

> **Superseded 20 Sept 03:40 (Adi, as designer).** The app shipped on the *classic* four-domain palette below, on the system's own greys, and that is the palette from here on — the fourth change in thirty hours and the last. The Okabe–Ito set that was here is kept in git history. The check in §2.2 was re-run on these values; the results are in "Run 2".

| Domain | Hue (both themes) | on `#FFFFFF` | on `#F2F2F7` | on `#000000` | on `#1C1C1E` | Counts |
|---|---|---|---|---|---|---|
| **LEARN** | `#2F6FE4` | 4.65:1 | 4.17:1 | 4.51:1 | 3.66:1 | assigned work — Canvas, syllabus, studying |
| **BUILD** | `#0F9C8C` | 3.41:1 | 3.06:1 | 6.15:1 | 4.99:1 | your own work — projects, applications |
| **BODY** | `#E04A32` | 4.04:1 | 3.62:1 | 5.20:1 | 4.21:1 | movement beyond the walk |
| **LIFE** | `#9A4DBF` | 5.01:1 | 4.49:1 | 4.19:1 | 3.39:1 | the focus ring — set by the student at setup |

Accents: **primary** `#2F6FE4` (= LEARN), **crisis** `#E11D48`, **chill** `#557488`. Each carries **white** text: 4.65:1, 4.70:1 and 4.95:1. Chill was `#6E8CA0` until 20 Sept; white on it was 3.55:1, which fails as text, so it was darkened.

One hue per domain in both themes, because the grounds are Apple's system colours (`systemBackground`, `secondarySystemBackground`) and the phone resolves those itself. Every arc clears **3:1** on all four grounds. **BUILD as text on a light card is 3.06:1 and must not be used as a word** — ink on a build fill, never build ink on white.

**Text drawn on top of a ring colour:**

| | Light | Dark |
|---|---|---|
| LEARN | white — 5.45:1 | ink `#12141A` — 7.14:1 |
| BUILD | ink `#12141A` — 5.02:1 | ink — 8.37:1 |
| BODY | ink `#12141A` — 5.23:1 | ink — 7.87:1 |
| LIFE | white — 6.53:1 | ink — 6.04:1 |

In dark mode ink text works on all four. In light mode it alternates, so **don't guess** — use the table.

### 2.2 The check that was run

Issue #15 asks for the check to be stated, so here it is in full.

**Contrast.** WCAG 2.1 relative luminance, each domain colour against its own theme's ground, threshold 3:1 for arcs and fills, 4.5:1 for any text. Lowest result is BODY on light at 3.26:1.

**Colour blindness.** Each colour converted to linear sRGB, transformed by the **Machado et al. (2009) deuteranopia matrix at severity 1.0**, converted to CIE L\*a\*b\*, then CIE76 ΔE computed for all six pairs. Threshold ΔE > 20, meaning two colours stay distinguishable to a red-green colour-blind viewer.

| Pair | Light ΔE | Dark ΔE |
|---|---|---|
| learn / build | 102.4 | 106.6 |
| learn / body | 37.9 | 30.5 |
| learn / life | 47.1 | 45.9 |
| build / body | 67.3 | 76.7 |
| build / life | 57.9 | 62.5 |
| **body / life** | **24.3** | **20.0** |

**Run 2 — the classic palette, 20 Sept 03:40.** Same method (Machado 2009 deuteranopia, severity 1.0, CIE76 ΔE, threshold 20):

| Pair | ΔE |
|---|---|
| learn / build | 65.4 |
| learn / body | 119.8 |
| **learn / life** | **24.8** |
| build / body | 55.1 |
| build / life | 41.1 |
| body / life | 95.8 |

All six clear. Learn and life are the tight pair this time — blue and purple — and they clear because life is markedly lighter. **If anyone re-tunes those two, re-run the check.** The rings also carry a direct label and a gap, so colour is never the only encoding.

*Run 1, on the Okabe–Ito set this file used to specify, kept for the record:* body and life were the tightest pair, which is expected — magenta and green are exactly what deuteranopia collapses. They clear the threshold because the two were deliberately separated in **lightness** as well as hue, which is the axis deuteranopia preserves. **If anyone re-tunes those two, re-run the check.** Making them closer in lightness is what breaks this.

The palette derives from Okabe–Ito, a set already validated for colour-blind viewers, with each colour's lightness retuned per theme to hit the contrast threshold.

### 2.3 Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F6F6F4` | `#12141A` | page ground |
| `surface` | `#FFFFFF` | `#191C23` | cards, sheets, rows |
| `surface-2` | `#EFEFEC` | `#21242C` | inset wells, tracks, tab strips |
| `line` | `#DFDFD9` | `#2C3038` | 1px borders and dividers |
| `ink` | `#191A1D` | `#EDEEF1` | primary text — 16.1:1 / 15.9:1 |
| `ink-2` | `#55575E` | `#A3A7B0` | secondary text — 6.7:1 / 7.6:1 |
| `ink-3` | `#6E7179` | `#80858F` | meta text — 4.5:1 / 5.0:1 |
| `accent` | `#0B6FA8` | `#5AA9DC` | interactive, selection, focus |
| `gold` | `#B07C00` | `#E6A21A` | tier and badge **fills** |
| `gold-text` | `#8A6200` | `#E6A21A` | tier and badge **text** — 5.1:1 / 8.4:1 |

`ink-3` is darker than it looks like it should be on purpose: at 11–12px it is real text and needs 4.5:1, so the obvious mid-grey fails. Same reason `gold` splits into a fill and a text value in light mode — the fill is 3.4:1, fine behind a shape, not fine as a word.

The greys carry a slight cool bias toward the LEARN blue. They are chosen, not inherited.

### 2.4 Semantic colour, and the one that doesn't exist

| Token | Light | Dark | Use |
|---|---|---|---|
| `warn` | `#8A5A00` | `#E0A94D` | a real system problem — server unreachable, stale data |
| `danger` | `#9B2C2C` | `#E08585` | destructive confirmations only |

**There is no colour for the user doing badly.** No red on a low score, no amber on a missed task, no dimming on the bottom of a leaderboard, no red ring. `warn` and `danger` describe what the *software* is doing, never what the *student* did. A red number on a student's own effort is the exact thing this product exists not to do, and a reviewer should reject any PR that adds one.

---

## 3. Ring states

A ring is a 4-domain concentric stack. Outermost is the active ring.

**Orbit opens with one ring: LEARN.** Others unlock at 70% of target for two consecutive weeks, in the order the student picks, starting with their focus pick.

| State | Track | Arc | Label |
|---|---|---|---|
| **Active** | `surface-2`, solid | domain colour, `stroke-width 9`, `linecap round` | domain name in `ink`, value in `ink-2` |
| **Locked** | `line`, `stroke-width 2`, `dasharray 3 6` | none | name in `ink-3`, plus the unlock condition |
| **Closed** | domain colour at 100% | full circle | name in domain colour |

Locked rings are **shown, not hidden**. A student who can see ring two has a reason to come back for it; a student who can't doesn't know it exists.

Geometry for a 96pt stack: radii 42 / 30 / 19 / 9, stroke 9 for active rings, rotate −90° so the arc starts at twelve o'clock and fills clockwise.

Locked ring label text: **"unlocks at 70% for 2 weeks"** — never "locked" alone, which tells the student nothing.

---

## 4. Typography

**Use the system font.** SF Pro on iOS via `.system`, and `-apple-system, "Segoe UI", system-ui, sans-serif` on web. No bundled or downloaded typeface.

This is deliberate. It is free, it ships instantly, it supports Dynamic Type on iOS for nothing, and — the reason that actually matters here — it removes any chance of the iOS app and the web app drifting apart on a font at hour twenty.

| Role | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| **Display** | 40 / 44 | 700 | −0.03em | the ledger number, weekly XP |
| **Title** | 22 / 28 | 600 | −0.02em | screen titles |
| **Section** | 16 / 22 | 600 | 0 | card headings |
| **Body** | 15 / 21 | 400 | 0 | running text, row names |
| **Label** | 13.5 / 19 | 500 | 0 | buttons, chips, tabs |
| **Meta** | 12 / 16 | 400 | 0 | row subtext, counts, timestamps |
| **Eyebrow** | 10.5 / 14 | 600 | +0.12em, UPPERCASE | section labels above content |

**Every number that sits in a column or changes in place gets tabular figures.** `.monospacedDigit()` on iOS, `font-variant-numeric: tabular-nums` on web. XP, minutes, percentages, ranks, counts. Non-negotiable — proportional digits make a live-updating number jitter.

Running text stays near 65 characters wide. Headings get `text-wrap: balance` on web.

---

## 5. Spacing, radius, elevation

**Spacing** — 4pt base: `4 · 8 · 12 · 16 · 20 · 24 · 32`. Screen gutter is **16**. Card padding is **16**. Gap between stacked cards is **22**.

**Radius** — `4` chips and bars · `8` buttons and inputs · `12` cards and rows · `16` the share card · `999` pills and avatars.

Not everything is a card. Border, fill, radius and shadow each say "separate object" — spend them on the thing that needs lifting, not on every block.

**Elevation** — one shadow, used only on cards that sit above the page ground:

```
light:  0 1px 2px rgba(25,26,29,.06), 0 10px 28px -18px rgba(25,26,29,.30)
dark:   0 1px 2px rgba(0,0,0,.40),    0 10px 28px -18px rgba(0,0,0,.85)
```

Rows inside a card get a 1px `line` divider, never their own shadow.

---

## 6. Motion

| Token | Duration | Curve |
|---|---|---|
| `micro` | 120ms | ease-out |
| `standard` | 200ms | `cubic-bezier(0.2, 0, 0, 1)` |
| `ring` | 320ms | `cubic-bezier(0.2, 0, 0, 1)` |
| `toast` | 200ms in, 2400ms hold, 200ms out | ease-out |

Rings animate **once, on appear**, from 0 to their value. They do not loop, pulse, or breathe. Bars and progress tracks use `standard`. Taps use `micro`.

### Reduce Motion

When Reduce Motion is on: no transforms, no scale, no slide. Rings and bars **jump to their value**. Anything that would have animated crossfades in ≤100ms instead. The XP toast still appears and still holds for 2400ms — it carries information, so it is never removed, only stilled.

**Haptics still fire under Reduce Motion.** It is a motion setting, not a feedback setting.

| Event | Haptic |
|---|---|
| Approve a proposal | `.impact(.medium)` |
| Mark a task done | `.notification(.success)` |
| Ring closes | `.notification(.success)` |
| Achievement earned | `.impact(.heavy)` |
| Decline, or any tab change | none |

Nothing haptic fires on a bad outcome. There is no failure haptic in Orbit.

---

## 7. Components

**Ring stack** — §3. 96pt on Today, 86pt on the share card.

**Tier medallion** — 86pt circle. Track `surface-2` / `#21242C`, arc `gold` at `stroke-width 7`, progress toward the next tier. Centre: tier number in Display weight `gold-text`, the word `TIER` beneath in Eyebrow `ink-3`.

**Badge / tier pill** — radius 999, padding 3×8, Eyebrow type, `gold` fill with `bg` text.

**Achievement row** — 30pt circle (earned: `gold` fill, tier numeral in `bg`; locked: 1.5px dashed `line` with `?` in `ink-3`), name in Body 600, requirement in Meta `ink-3`, count right-aligned in Meta, 3px progress bar beneath spanning from the name to the right edge. Earned bars use `gold`, locked use `ink-3`.

**Crew row** — 26pt rank column in Label 600 `ink-3`, name in Body with a tier pill, meta line in Meta `ink-3`, 3px `accent` bar, value right-aligned in Section 600 with a unit label in Meta `ink-3` below. Your own row gets `accent` mixed 8% into `surface` — a tint, never a border.

**XP toast** — `surface` card, shadow, radius 12, XP in Display, reasons beneath in Meta as a middot-separated list. Holds 2400ms.

**Empty states** — Section-weight line in `ink`, explanation in Body `ink-2`, centred, 26pt vertical padding. Never an icon of a sad face, an empty box, or a ghost.

### Mode states

| Mode | Treatment |
|---|---|
| **Normal** | default |
| **Crisis** | non-coursework cards drop to `opacity 0.38` and stop responding to taps. No colour change, no red, no strikethrough. A line at the top says coursework only. |
| **Chill** | undeadlined work is removed from the list entirely rather than dimmed. Meals and due homework stay. |

Crisis **dims**; chill **removes**. Dimming says "still there, not now". Removing says "not your problem today". Getting these backwards changes what the mode means.

---

## 8. Voice

Orbit talks like **a friend who did the math**. It knows your timetable, it tells you the truth, and it never nags.

**Rules**

1. Under 12 words a line wherever possible.
2. Second person. "You have 9h 49m", not "9h 49m available".
3. Digits, never words. "9h 49m", not "nine hours".
4. No exclamation marks. No emoji. Anywhere.
5. Never count what the student failed to do.
6. State the number before the feeling. The number *is* the reassurance.
7. No orbital vocabulary — see §1.

**Five good lines**

- `You have 9h 49m.`
- `Nothing fits. Enjoy it.`
- `Leave by 13:16 for the 71B.`
- `Yesterday didn't land. Today has 9h 12m.`
- `+143 XP · 90 focused minutes · done inside a planned gap · on time`

**Five banned lines**

- `You've got this! 💪` — cheerleading, and an emoji
- `You missed 3 tasks yesterday.` — counts failures
- `Don't break your streak!` — motivates with fear, and streaks don't break
- `Crushing it, superstar!` — cringe
- `Let's get back on track 🚀` — implies the student was off track

The shape of the difference: every good line is a fact, and every banned line is a feeling the app decided the student should have.

---

## 9. Tokens

**CSS**

```css
:root{
  --bg:#F6F6F4; --surface:#FFF; --surface-2:#EFEFEC; --line:#DFDFD9;
  --ink:#191A1D; --ink-2:#55575E; --ink-3:#6E7179;
  --accent:#0B6FA8; --gold:#B07C00; --gold-text:#8A6200;
  --warn:#8A5A00; --danger:#9B2C2C;
  --learn:#0B6FA8; --build:#B07C00; --body:#C26D9C; --life:#006B4F;
  --learn-on:#FFF; --build-on:#12141A; --body-on:#12141A; --life-on:#FFF;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#12141A; --surface:#191C23; --surface-2:#21242C; --line:#2C3038;
    --ink:#EDEEF1; --ink-2:#A3A7B0; --ink-3:#80858F;
    --accent:#5AA9DC; --gold:#E6A21A; --gold-text:#E6A21A;
    --warn:#E0A94D; --danger:#E08585;
    --learn:#5AA9DC; --build:#E6A21A; --body:#E191BC; --life:#00A87B;
    --learn-on:#12141A; --build-on:#12141A; --body-on:#12141A; --life-on:#12141A;
  }
}
:root[data-theme="dark"]{ /* repeat the dark block so an explicit toggle wins */ }
```

Define every token on bare `:root` first. A colour whose only definition sits inside a media query renders one theme's text on the other theme's ground for everyone on the default "system" setting.

**SwiftUI**

```swift
extension Color {
    static func dyn(_ light: UInt, _ dark: UInt) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
    static let oBg       = dyn(0xF6F6F4, 0x12141A)
    static let oSurface  = dyn(0xFFFFFF, 0x191C23)
    static let oSurface2 = dyn(0xEFEFEC, 0x21242C)
    static let oLine     = dyn(0xDFDFD9, 0x2C3038)
    static let oInk      = dyn(0x191A1D, 0xEDEEF1)
    static let oInk2     = dyn(0x55575E, 0xA3A7B0)
    static let oInk3     = dyn(0x6E7179, 0x80858F)
    static let oAccent   = dyn(0x0B6FA8, 0x5AA9DC)
    static let oGold     = dyn(0xB07C00, 0xE6A21A)
    static let oGoldText = dyn(0x8A6200, 0xE6A21A)
    static let oLearn    = dyn(0x0B6FA8, 0x5AA9DC)
    static let oBuild    = dyn(0xB07C00, 0xE6A21A)
    static let oBody     = dyn(0xC26D9C, 0xE191BC)
    static let oLife     = dyn(0x006B4F, 0x00A87B)
}
```

**Dark mode from the start, both apps.** Not a later pass.

---

## 10. What is not in this file

Every user-facing string lives in `docs/copy.md` — empty states, XP toast reasons, crisis and chill explanations, the bus ghost warning, the extension-email rules, the morning briefing and the evening check-in. §8 governs how those are written; it does not contain them.

The XP and achievement rules live in `docs/economy.md`.
