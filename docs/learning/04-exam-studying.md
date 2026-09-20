# Aspect 4: exam studying

Not how long someone revises — **when those minutes happen**. The app currently assumes revision spreads evenly over the three days before an assessment. If a student really does 80% of it on the last night, that plan is fiction: the early sessions never happen, and the last night is asked to hold more than it has room for.

So the learner predicts the **cram share** per kind of assessment, and is scored on the thing that matters: can Orbit see, a week out, that the last night will not fit what is about to be crammed into it?

The planted pattern: quizzes get crammed hardest, because they are small enough to feel survivable the night before. Maya crams 74% of quiz revision into the last night, Jordan (held out) 98%.

## Result

Weeks 2–8, 9 assessments per student.

| | Maya: error in predicted share | Jordan: error |
|---|---|---|
| No learning (the app's even third) | 0.4 | 0.6 |
| Running average | **0.3** | **0.1** |
| Nemotron | **0.3** | **0.1** |

**Last nights that could not hold the cram:**

| | Maya (2 of 9) | Jordan (4 of 9) |
|---|---|---|
| No learning | 0 caught | 1 of 4 |
| Running average | **2 of 2** (1 false alarm) | **4 of 4** |
| Nemotron | **2 of 2** (1 false alarm) | **4 of 4** |

## The verdict: a tie on the outcome, worse on the numbers

Nemotron catches every under-capacity night, exactly as the running average does. But its learned values are clearly worse, and it stops learning:

| | Nemotron | Running average | Truth |
|---|---|---|---|
| Jordan, quizzes | 1.96 | 2.87 | 2.94 |
| Jordan, midterms | 1.00 | 1.72 | 2.40 |

It jumped to 3.0 for quizzes in week 1 — almost exactly right — then pulled back to 1.96 in week 2 and **never moved again for six weeks**, while being wrong the whole time. **Midterms were never learned at all**, because they only happen twice in eight weeks and the evidence threshold never cleared.

It reaches the right warning through a number that is wrong, which works here only because the gap between what gets crammed and what the night holds is wide. On a closer call it would miss.

Its memos also show it did not understand the aspect: *"Student consistently underestimates quiz prep time by factor of 2"*. It is describing a **share of revision** as if it were a **duration**. The same category of failure as aspect 3 — the arithmetic survives, the meaning does not.

## Recommendation

**Use the running average for this aspect.** It is more accurate, it learns midterms that Nemotron never touches, it has no latency, and it reaches the same warnings.

The warning itself is worth building either way. "You do almost all your quiz revision the night before, and Thursday night has 70 usable minutes for 118 minutes of cramming" is a genuinely useful thing to say a week in advance, and nothing in the app says it today.

## Reproduce

`GET /api/learning/experiment?aspect=exams&arms=raw,weekly-rules,weekly-nemotron` (add `&student=b`).
