# Aspect 2: walking speed

Same method as aspect 1: **one week in, check the next week changes.** Week N is planned with only what the learner knew before week N, then scored, then revealed to it.

## What is different about this aspect

Walking is not an estimate of effort, it is a physical fact with a hard consequence: **a minute short means being late to class**, and it also inflates every gap in the honest ledger. So the score is not only mean error, it is how often the plan came in short at all.

The synthetic student walks four campus legs, three times a week each. One leg carries hidden extra difficulty (Benedum to the Cathedral is uphill and ends with the Cathedral's slow lifts, 1.25x), so no single "this student walks 1.15x" number can fit all four. The learner has to find the legs, not just the student. **Maya** walks at 1.15x the app's allowance, **Jordan** (held out) at 0.92x — he is *faster* than the app thinks.

Crucially, unlike assignments, **the app already learns this**: `TravelGraph` switches from its default to the observed median after three trips on a leg.

## Result

Weeks 2–8, 84 walks per student:

| | Maya: mean error | Maya: walks planned short | Jordan: mean error | Jordan: planned short |
|---|---|---|---|---|
| No learning | 2.1 min | 99% | 1.1 min | 31% |
| **App today (median after 3 trips)** | **0.8 min** | 39% | **0.6 min** | 46% |
| One week at a time, running average | 0.9 min | 63% | 0.6 min | 44% |
| One week at a time, Nemotron | 0.8 min | 40% | 1.3 min | 8% |
| App today + 15% safety buffer | 2.1 min | **0%** | 1.8 min | **0%** |

**Did it learn from one week?** Yes, and on Maya almost perfectly. After week 1 alone it had 1.08 / 1.13 / 1.40 / 1.08 and converged to 1.15 / 1.15 / 1.45 / 1.11 against a hidden truth of 1.15 / 1.15 / 1.44 / 1.09. It correctly singled out the uphill leg every week: *"Student runs long on Benedum->Cathedral, moderate on the others."*

## The verdict: do not use Nemotron for walking

It learns the pattern, but it does not beat the code that is already there.

- On Maya it **exactly ties** the existing travel graph (0.8 min, ~40% short). A model call bought nothing.
- On Jordan it is **worse** (1.3 vs 0.6 min). It never went below 1.0, even while its own memo said *"short on other routes"* — it knew he was fast and would not act on it, because the brief told it lateness is costly. It traded accuracy for caution.
- That caution is the only thing it added, and **a buffer buys the same thing in code for free**: the median plus 15% takes lateness to 0% for both students, with no model call and no latency.

The buffer is a dial, not a discovery. 15% eliminates lateness at a cost of about 2 minutes over-allowed per walk, which understates usable time. A smaller buffer trades the other way. That is a product decision, and it does not need a model to make it.

## Why this aspect behaves so differently from assignments

| | Assignments | Walking |
|---|---|---|
| Records per category per week | 1–3 | 3 |
| Spread between records | wide (effort varies) | narrow (10%) |
| Did the app already learn it? | no | yes, median after 3 trips |
| Nemotron vs the code baseline | **3.9 vs 6.8 min — clearly better** | 0.8 vs 0.8 min — a tie, or worse |

The rule this suggests: **a model earns its place where the signal is sparse, noisy and not already modelled.** Walking is frequent, tight and already handled by a median. Assignments were none of those.

This is also the aspect that shows the test can fail. That is what makes the assignment result worth trusting.

## Reproduce

`GET /api/learning/experiment?aspect=walking&arms=raw,existing,existing-buffered,weekly-rules,weekly-nemotron` (add `&student=b`). The response includes `trace`, the week-by-week record.
