# Aspect 3: procrastination

The first aspect where the answer is not how long something takes, but **when the student actually starts it** — and where the consequence is a missed deadline, not a bad estimate.

The app currently assumes work gets started about 12 hours before it is due. The learner predicts, per kind of work, how many hours before a deadline this student really begins.

The pattern planted in the synthetic student is the one that matters in real life: **people leave the work they dread until last.** Big assignments get started closest to the wire even though they need the most time. Maya starts big assignments about 4 hours before they are due and small homework 12.6 hours before; Jordan (held out) starts big assignments **2.2 hours** before. Deadlines can genuinely be blown here — nothing guarantees the student finishes in time.

## Result

Weeks 2–8, 24 deadlines per student.

| | Maya: error in predicted start | Jordan: error in predicted start |
|---|---|---|
| No learning (the app's 12-hour assumption) | 5.7 h | 7.7 h |
| One week at a time, running average | 2.1 h | 2.1 h |
| One week at a time, Nemotron | **1.9 h** | **0.9 h** |

**The part that matters — deadlines this student will not make.** Jordan blows 8 of his 24 deadlines:

| | Blown deadlines caught in advance | False alarms |
|---|---|---|
| No learning | 0 of 8 | 0 |
| Running average | 2 of 8 | 0 |
| **Nemotron** | **7 of 8** | 2 |

## The finding: two aspects only work together

A deadline is blown when the student starts later than the work needs. Predicting that needs **both** halves: when they start *and* how long the work will really hold them.

Asked with the student's own estimate of the work, Nemotron catches **4 of 8**. Asked with what aspect 1 learned the work actually takes, the same prediction catches **7 of 8**.

So aspect 1 and aspect 3 are not independent features. Knowing someone procrastinates is not actionable on its own; it becomes actionable only once you also know their work runs 1.6x their own estimate. That is the first real argument for learning several aspects rather than one.

## What is still wrong

**1. It describes its own numbers backwards.** Nemotron's memo for Maya reads *"completes big assignments and labs quickly but procrastinates on regular assignments"* — the exact opposite of what it had just decided. A low multiplier here means starting **late**, and it read it as efficiency. Jordan's memo says he *"consistently finishes work well ahead of schedule"* while the number it chose means he starts **50 minutes** before a deadline.

This is a different failure from the reciprocal bug in aspect 2. There the arithmetic was flipped; here the arithmetic is fine and the *meaning* is inverted. It matters because the memo is the model's memory, so a wrong belief is carried into every later week — and if that sentence ever reaches the student or the voice agent, it would tell them the reassuring opposite of the truth. Nothing currently catches it.

**2. It catches risk by being pessimistic, not by being right.** Nemotron put Jordan's big assignments at 0.07 against a truth of 0.183 — it thinks he starts far later than he does. That bias is *why* it catches 7 of 8, and it is also why it raises 2 false alarms. A better version would predict the spread ("usually 2.2 hours, sometimes 1.4") rather than being uniformly gloomy about the average.

**3. On Maya it wanders.** Big assignments went 0.55 → 0.44 → 0.75 → 0.50 → 0.35 → 0.25 → 0.35 → 0.30 across eight weeks instead of settling. The running average was steadier. Her deadlines are mostly safe, so the wandering costs little here, but it would matter for a student closer to the edge.

## Where this leaves the aspect

The prediction is good enough to be useful and the risk-catching is a real product capability that nothing in the app does today. But the backwards memo has to be fixed before any of this text is shown to a student, and the pessimism should become an honest spread rather than a thumb on the scale.

## Reproduce

`GET /api/learning/experiment?aspect=procrastination&arms=raw,weekly-rules,weekly-nemotron` (add `&student=b`). `risk` uses the learned work length, `riskNaive` the student's own estimate.
