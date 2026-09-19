# What Orbit is trained on, and what it is not

Adi asked the question a judge will ask: *is the agent trained on my data?*

**No. Nothing in Orbit is trained or fine-tuned on anyone's data.** There is no training loop, no fine-tune, no embedding of a student's history into a model. `grep` the repo for `fine.?tune|training|\.fit\(|lora|checkpoint` and you get nothing in `src/` or `scripts/`.

This is worth saying plainly rather than letting a demo imply otherwise, because "personalised AI" usually means a model that learned you, and ours deliberately does not.

## The three models, and what each one sees

| Model | Where it runs | What it knows about the student |
|---|---|---|
| `claude-sonnet-4-5` (the voice agent) | ElevenLabs' cloud | Only what a tool hands it *during the conversation*. It is a general pretrained model; it has never seen this student before and forgets them when the call ends. |
| `claude-sonnet-4-5` (the Day Agent) | Our server, per request | The day it is asked to plan, in the prompt. Nothing persists between requests. |
| `nemotron-3.5-lightning` (estimator, Critic, habit wording) | NVIDIA's hosted API | One task title, or one already-computed statistic. Never raw history. |

The student's data reaches a model only as **input at the moment of the request**, the same way a question does. It is never used to change a model's weights, never sent anywhere to train, and none of the providers we call are given it for that purpose.

## So where does the personalisation actually live?

**In code, in `src/core/`, in arithmetic you can read.** That is the part that learns.

- **`estimator.ts`** — the real "learning". It records what you guessed against what a task actually took, needs **5 samples** before it will say anything, trims the best and worst, and caps the correction at **3×**. That is why the agent can say "your MATH 0220 estimates are 1.6 times what you guess". That 1.6 is a division, not a model.
- **`habits.ts`** — measures pace by time of day, overrun by domain, how close to deadlines you finish. Needs **≥3 sessions per bucket** and a **≥0.15 pace gap** before it will name a pattern.
- **`game.ts`** — XP, capped server-side so it cannot be farmed.

A model is involved in exactly one way: `habitAgent.ts` hands Nemotron the numbers **our code already computed** plus the sentences our code would have written, and asks it to word them better. Then **code verifies every claim** — every number in the prose must be a value we cited, or the insight is thrown away and the code's own sentence is used instead. Rejections are reported.

## Why this is the stronger position, not the weaker one

Three reasons, and they are all worth saying out loud in the pitch:

1. **It works on day one.** A model fine-tuned on your history needs a history. A student installing Orbit the night before a midterm has none. The heuristic answers immediately, the estimator takes over after five real sessions, and the model only ever handles the cold start. `docs/eval.md` is the evidence: the ten-line heuristic **beat** the model (MAE 16.3 vs 35.3), and the design changed to match that result instead of hiding it.

2. **You can audit why.** "Your window grew by 569 minutes" traces to two numbers in a diff. If the personalisation lived in weights, the honest answer to "why did it say that?" would be "we don't know."

3. **Your schedule is not training data for someone else's model.** Nothing leaves to be learned from.

## The one fine-tune we planned, and why it is cut

Issue **#5** — a Brev fine-tune of Nemotron Nano for task-minute estimation — is the only actual training in the plan, and it is stretch-only per issue #23, gated behind three other issues being green. If it happens it trains on the **synthetic** session log, not on a real student's data. If it does not happen, nothing in the product changes, which is the point.

## What to say if a judge asks

> "Nothing is trained on the student. The agent is a general model that only sees what a tool hands it mid-conversation. The part that learns you is about forty lines of arithmetic in `estimator.ts` — five samples, trimmed, capped at three times — and you can read it. We tried the model on that job, measured it, and it lost to ten lines of string matching, so we kept the arithmetic and gave the model the job it is actually good at: wording the numbers, with code checking every one."
