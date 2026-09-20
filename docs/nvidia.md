# NVIDIA: what Nemotron does here, what we measured, and what the credits are for

> The track is "Beyond the Chatbot". The answer is a list of jobs, none of which is chat, and a page of numbers that includes the losses. `/eval` on the running app is the judge's page.

## The five jobs, and the one we took away

| Job | Where | Guardrail |
|---|---|---|
| Plans the day | `/api/plan`, tier under Claude, first when there is no Anthropic key | `move_task` and `book_room` only; every id checked against real gaps and tasks; code fills any window it skips; 12 s ceiling then the deterministic plan |
| Estimates task minutes | `src/agents/estimate.ts` | anchored to the heuristic and clamped to 0.5x–2x in `src/core/estimator.ts`; property-tested with no key |
| Parses syllabus PDFs | `src/agents/parse.ts`, Nemotron Parse | every deadline carries a page and a box, or it is dropped |
| Judges the other agents | `src/agents/critic.ts` | can lower trust, never raise it; rule-based floor; 4 s budget |
| Learns the student | `src/agents/weeklyLearner.ts`, `src/lib/learned.ts` | one week at a time, in context, with its own memo; eleven aspects, each inert until it has evidence; code writes every sentence |
| ~~Rewords spoken answers~~ | removed 20 Sept | it turned "nothing to leave for" into "leave at 9:05"; the checker licenses numbers, not meaning |

Nothing was fine-tuned. Say *learns, measured*. Never *trained*.

## The numbers a judge will ask about

Estimation, ten synthetic sessions, same truth, three scorers: heuristic **16.3** MAE, Nemotron zero-shot **35.3**, Nemotron anchored + clamp **~17–20** depending on how many calls the endpoint answered that run. A ten-line heuristic beat the model; the fix was code, not prompting; the eval says so.

Learning, two synthetic students, one held out, week by week: Nemotron wins on assignment length (3.9 min vs 6.8 for a running average) and on procrastination (7 of 8 blown deadlines caught vs 2); it ties on exam cramming and loses to a median on walking speed. We ship the median where the median wins. Write-ups in `docs/learning/`.

## Two things we found about the hosted endpoint

1. **`response_format` with a strict JSON schema makes `nemotron-3.5-lightning-30b-a3b` emit tab characters until `max_tokens`** — 15.4 s for a reply that never closes. The same request without the schema answers in 796 ms. Every "Nemotron is slow" finding of the night was this. We send prompt-only and extract the JSON; the schema is a second attempt reserved for a reply that is not JSON.
2. **The free tier rate-limits at a handful of requests per second**, and a 429 used to be routed into the schema retry. Now a 429 waits 2.5 s and repeats once; the eval runs one call at a time.

## Which model, measured on submission morning

Eight prompt-only estimate calls per model, thinking off, 20 s ceiling, 09:53 on 20 Sept:

| Model | Answered | Median | p90 |
|---|---|---|---|
| `nvidia/nemotron-3.5-lightning-30b-a3b` | 5/8 | 8.8 s | timeout |
| `nvidia/nemotron-3-super-120b-a12b` | 4/8 | 0.6 s | timeout, 503s |
| `mistralai/mistral-nemotron` | 6/8 | 1.0 s | timeout |

`nemotron-3-nano-30b-a3b` and the two `llama-3.1-nemotron` ids return an error instantly on this key. Nothing avoids timeouts, so the answer is not a model but a second one: the primary gets a short budget, then one attempt on `mistral-nemotron`, then the deterministic tier. `NEMOTRON_FALLBACK_MODEL` overrides it. The planner budget is 7 s per model.

## What the Brev credits are for

The credits on the account (`$60`, coupon redeemed 20 Sept) are GPU time, not API quota. The API we call is `integrate.api.nvidia.com`, which is free and rate-limited and, on the night before submission, hung on roughly a third of calls regardless of what we sent.

The one use of the credits that would change the demo is **reliability, not capability**: a NIM container on a Brev instance serving the same Nemotron family behind an OpenAI-compatible endpoint, with no 429s and no shared queue. The app already supports it — three variables, no code:

```
NVIDIA_BASE_URL=https://<brev-instance>/v1
NVIDIA_API_KEY=<the NIM key, or any string if the container does not check one>
NEMOTRON_MODEL=<the model id the container reports at /v1/models>
```

`src/agents/models.ts` lists `/v1/models` on start and picks the first candidate present, so pointing `NEMOTRON_MODEL` at whatever the container serves is enough. Restart the server; `/api/nvidia` should show `keyPresent: true` and the chosen id.

Launching it is a browser job on the account that holds the credits: Brev → Launchables → a NIM for a Nemotron model → deploy → expose the port → copy the URL. Time-box it to 45 minutes. If it is not answering by then, the hosted endpoint with the 12 s ceiling and the deterministic fallback is what we demo, and every tier still names itself in `provider`.

**A fine-tune was considered and not done.** With hours left it is a four-hour job with three places to fail, and the only data to train on is our own synthetic simulator — a model "beating" a heuristic on data we generated would not survive one question.

## Before each table

```
node scripts/warm.mjs
```

Runs the weekly review (so `learned[]` is on Today and in the voice), the eval (cached ten minutes, so `/eval` opens at once), one Plan my day (so the provider line reads `nemotron-hosted`), and checks the voice token. About a minute when the API is quiet.
