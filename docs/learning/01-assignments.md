# Optimization 1: assignment time

**Question.** If a student's big assignment takes 2 hours in week 1 but the app planned 1.5, does the app plan it better in week 2?

**What was tested.** A synthetic student (all data made up, flagged `synthetic`) is replayed week by week. The plan for week N uses only weeks before N; then week N is revealed, scored, and reviewed so it can change week N+1. Week 1 cannot benefit from anything, so results cover weeks 2 to 8 (7 weeks, 28 assignment sessions per student: big assignments, homework and lab reports). Four arms:

| Arm | What plans the time |
|---|---|
| No learning | the student's own estimate |
| App today | the existing per-course calibration (needs 5 samples per course and domain) |
| Weekly learner, code decides | measures each kind of work weekly, adopts every correction with enough evidence |
| Weekly learner, Nemotron decides | same measurements; hosted Nemotron chooses adopt, step or hold per kind and writes the notes; code computes every number and verifies every claim |

Two students, so the settings were not tuned to one: **Maya** (big assignments really take 1.33x her estimate, labs 1.2x, reading 0.85x) and **Jordan**, held out (1.6x, 0.95x, 1.1x, different seed). The learner never sees these true values, only the logs.

## Result

| | Mean error (min) | Plan too short by (min, total) | Sessions under-planned |
|---|---|---|---|
| **Maya** | | | |
| No learning | 21.1 | 505 | 71% |
| App today | 14.8 | 337 | 46% |
| Weekly learner, code decides | **6.3** | **138** | **4%** |
| Weekly learner, Nemotron decides | 6.3 (3 of 8 weeks decided by Nemotron; the other 5 timed out or had nothing to decide) | 138 | 4% |
| **Jordan (held out)** | | | |
| No learning | 29.7 | 655 | 67% |
| App today | 20.0 | 434 | 46% |
| Weekly learner, code decides | **6.5** | **127** | **17%** |
| Weekly learner, Nemotron decides | 7.2 (all 8 weeks decided by Nemotron) | 129 | 17% |

The example from the brief: **Problem Set 2, estimated 90 minutes, took 115.** No learning plans 90. The weekly learner plans **110**. For Jordan (took 138) it plans **125**.

## What this shows

1. **The weekly loop works.** Mean error falls about 70% and minutes planned too short fall about 73% against no learning, and it beats the app's current calibration by more than half. It holds on the held-out student. Learned multipliers land within 0.03 to 0.12 of the hidden truth (shrinkage toward "your estimate is right" and sampling noise account for the gap).
2. **Nemotron's decisions did not beat plain rules for this optimization.** It tied on Maya and was slightly worse on Jordan (7.2 vs 6.5) because it was more cautious than the data justified (half-steps and holds where the ratio was consistent). A correction of the form "multiply by the measured ratio" is simple enough that code does it as well as a model.
3. **Latency matters.** Hosted Nemotron took 1 to 90 seconds per weekly review and timed out in 3 of 8 weeks for Maya even at 90 s. Timeouts fall back to the rules decision, visibly, by design.
4. **Nemotron's notes needed guarding.** Its numbers were real but its stories were not always: "consistent overestimation" for work that takes longer than estimated, "trending down from 1.22x to 1.27x" (up), "8 weeks of data" for 8 sessions, "getting faster" for a flat ratio. The verifier now checks direction, code-computed trend, and weeks against sessions. Replaying the notes Nemotron actually wrote through it refuses 10 of 18 for Jordan and 0 of 10 for Maya.
5. **One threshold was tuned on Maya, and confirmed on Jordan.** Corrections under 0.05 were ignored, which stalled labs at 1.097 against 1.2; the minimum change is now 0.03.

## Limits

- Synthetic student, 8 weeks, one aspect. The gap between "no learning" and the learner is real for this data; a real student is noisier and changes over time.
- Nemotron notes in the table above were written before the stricter verifier; the verifier's effect was measured by replay, not by a new live run.
- Nothing here changes the live app yet. The learned multipliers are computed and tested offline; they are not wired into `planningMinutes`.

## Reproduce

`GET /api/learning/experiment?aspect=assignments&arms=raw,existing,rules` (instant), add `nemotron` for the live arm (about 2 to 4 minutes), add `&student=b` for the held-out student. Tests: `npm test` (`learning.test.ts`, `learner.test.ts`).
