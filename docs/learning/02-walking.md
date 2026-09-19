# Aspect 2: walking speed

**The design, as specified:** if the app allows 10 minutes and this person takes 8 every time, then after two or three weeks the app should show **8**, not pad it back to 10. That 0.8 is a fact about the person, so it applies to *every* walk including ones they have never taken. A single leg only gets its own number when it keeps disagreeing with that pace, because then there is a real reason for it — a hill, a slow lift.

So the learner has two parts:

- **one walking pace per person**, learned from every walk pooled together;
- **per-leg exceptions**, allowed only after a leg has disagreed with that pace in **2 separate weeks**.

Nothing changes at all before week 2, and nothing is padded upward.

## The decisive test

A fifth leg, Sennott to Posvar, appears only in **week 5**, when a class moves. A learner that knows the person's pace should get it right on the very first walk. Anything learning leg by leg is still blind, because the app's travel graph needs three trips before it will move off its default.

## Result

Weeks 2–8. Maya really walks at 1.15x the app's allowance; **Jordan (held out) at 0.92x — he is faster than the app thinks.**

| | Maya: error | Maya: **new leg** | Jordan: error | Jordan: **new leg** |
|---|---|---|---|---|
| No learning | 2.0 min | 1.5 min | 1.1 min | 0.7 min |
| App today (median after 3 trips) | **0.8 min** | 1.1 min | **0.6 min** | 0.7 min |
| One week at a time, running average | 1.0 min | **0.7 min** | 0.8 min | **0.6 min** |
| One week at a time, Nemotron | 1.2 min | 0.8 min | 0.8 min | 0.7 min |

**The pace itself is learned almost exactly:**

| | Nemotron learned | Truth |
|---|---|---|
| Maya's pace | 1.17 | 1.15 |
| Jordan's pace | **0.93** | 0.92 |

Jordan's 0.93 is the scenario in the brief working: a 10-minute walk is now shown as **9.3 minutes**, not 10. The app tells him he is faster, which is what an honest ledger should do.

**It also found the reason.** From week 1, unprompted: *"Student walks consistently faster than app defaults, except Benedum to Cathedral which has a hill or slow lift."* It separated the person's pace from one route's difficulty, and named why. The median can never do that — it only ever produces a number.

## What is still wrong

- **On overall error the median still wins** (0.8 vs 1.2 for Maya). Nemotron is accurate on the pace but **overshoots the exception**: it set the hill leg to 1.58 against a truth of 1.44, because it takes the exception from one week's ratio instead of easing into it. Blending the exception the way the pace is blended should close most of this.
- The new-leg advantage is real but small here, because by week 5 there is a lot of data. It would matter far more for a student who changes buildings often.

## The failure this went through

Week 6 of the first run, Nemotron flipped Maya's pace from 1.18 to **0.84** while its own memo still said *"walks 16% slower than app default"*. 0.84 is 1/1.18: it had answered the ratio upside down, and every displayed walking time would have collapsed at once.

Code now refuses any number closer to the reciprocal of the week's evidence than to the evidence itself (`isInverted`). That single guard took Maya from 1.7 to 1.2 mean error and removed the failure entirely from the re-run.

This is worth keeping in mind generally: the model is reliable about *direction and reason* and unreliable about *arithmetic*. Every number it produces needs a sanity check against the evidence it was given.

## Recommendation

Use both, for the parts each is good at:

- **Nemotron for the person's pace**, because it transfers to unseen legs and it is the thing that makes the app show 8 minutes instead of 10.
- **The travel graph median for legs with plenty of history**, because it is simply more accurate there.
- **No safety buffer.** An earlier version padded times upward to avoid lateness; that was wrong. It inflates every gap and contradicts the honest ledger.

## Reproduce

`GET /api/learning/experiment?aspect=walking&arms=raw,existing,weekly-rules,weekly-nemotron` (add `&student=b`). The response includes `trace` and a `transfer` score for the week-5 leg.
