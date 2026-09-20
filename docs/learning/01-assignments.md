# Aspect 1: how long assignments really take

The rule for every aspect: **feed one week at a time, and check that the second week actually changes.**

## How the test works

A synthetic student (all data invented, flagged `synthetic`) is replayed week by week.

1. Week N is planned with **only** what the learner knew before week N.
2. Week N is scored against what the work really took.
3. Only then is week N revealed to the learner, which updates itself for week N+1.

Nothing is ever scored on data the learner had already seen. Week 1 cannot benefit from anything, so it is identical in every arm and is the baseline.

**Nemotron is the thing that learns.** It sees one week, never the history. It sees what *it* planned against what the work took, so it can correct itself. It carries its own memory: the multipliers it chose plus a memo it writes to its future self. **It produces the number**; code only clamps it to 0.4–3.0 as a safety rail.

Scope: only assignment-shaped work is shown to it (big assignments, homework, lab reports). Readings and exam studying are hidden, because it is being trained on this aspect and nothing else.

Two students, so nothing is tuned to one. **Maya** (big assignments really take 1.33x her estimate, homework 1.05x, labs 1.2x) and **Jordan**, held out with a different seed (1.6x, 1.2x, 0.95x). The learner never sees these true values.

## Result

Mean error between the planned minutes and the real minutes, over weeks 2–8:

| | Maya | Jordan (held out) |
|---|---|---|
| No learning (student's own estimate) | 21.1 min | 29.7 min |
| App today (per-course calibration) | 14.8 min | 20.0 min |
| One week at a time, running average (no model) | 6.8 min | 8.5 min |
| **One week at a time, Nemotron learns** | **3.9 min** | **6.7 min** |

Assignments planned too short: 71% → 0% for Maya, 67% → 4% for Jordan.

**Does one week change the next one?** Yes, and almost all of it lands immediately:

| | What Nemotron chose after week 1 | The hidden truth |
|---|---|---|
| Maya, big assignments | 1.34 | 1.33 |
| Maya, homework | 1.07 | 1.05 |
| Maya, lab reports | 1.14 | 1.20 |
| Jordan, big assignments | 1.58 | 1.60 |
| Jordan, homework | 1.22 | 1.20 |
| Jordan, lab reports | 0.90 | 0.95 |

Week 2 error falls from 15.0 to **2.7** minutes for Maya and from 18.0 to **6.7** for Jordan, purely from having seen week 1. After that it holds the pattern and makes small corrections rather than drifting.

The example from the brief: **Problem Set 2, estimated 90 minutes, took 115.** Without learning the app plans 90. After one week it plans **119**.

Latency 1.2–22.6 s per weekly review, every week answered, no timeouts. A weekly background job, so this is well inside budget.

## The failure this went through first

The first live run was much worse: Nemotron set **every** kind of work to a flat 1.1 for Maya and then oscillated 1.1 → 1.0 → 1.1 → 1.0 for eight weeks, while its own memo said "consistently underestimates time" the entire time. It contradicted its own memory and never converged (mean error 15.0, barely better than not learning). It worked on Jordan only because his misses were large enough to be obvious.

Three causes, all in the prompt, all fixed:

1. **It was doing arithmetic.** It had to divide actual by estimate in its head and instead reached for a round number. The per-kind ratio is now handed to it. The division is given away; the decision is not.
2. **It could move a multiplier down while its plans were still coming in short.** Now stated as a rule: if the work ran over what you planned, the multiplier goes up, never down.
3. **It ignored its own memo.** Now stated as a rule: the memo is your memory of this student, do not contradict it.

After those three lines, Nemotron beat the running average on both students instead of losing to it on one.

## What is still wrong

- On Jordan it overshoots on a noisy week: homework drifted to 1.33 against a truth of 1.20, and labs to 0.82 against 0.95. Weeks 5 and 8 are its worst (12.5 and 10.3 min).
- One aspect, one synthetic student shape, 8 weeks. A real student changes over a term; this one does not.
- Nothing is wired into live planning yet.

## Reproduce

`GET /api/learning/experiment?aspect=assignments&arms=raw,existing,weekly-rules,weekly-nemotron` (add `&student=b` for the held-out student). The response includes `trace`, the week-by-week record of what the learner saw, what it changed and what it wrote to itself. Tests: `npm test` (`weeklyLearner.test.ts`).
