# Eval: does Nemotron actually help?

NVIDIA's track asks for "an eval, comparison, benchmark, or even a failure you found." We found one, and it changed the design. This is the honest record.

## The job

Nemotron's non-chat job in Orbit is to read a task title and say how many focused minutes it takes and which ring it belongs to. That number drives the gap finder (what fits in your 196-minute window), the capacity ledger (are you over-committed), and XP (planned versus actual). A bad estimate is not cosmetic; it puts the wrong task in your afternoon.

Ground truth is a synthetic session log of ten tasks, because on day one there are no real logged sessions. The estimator already records guess versus actual per course, so this gets replaced by real data as students use the app.

## Run 1: the model lost to ten lines of string matching

Measured 2026-09-19 by Jatin against `nvidia/nemotron-3.5-lightning-30b-a3b` on NVIDIA's hosted API.

| Scorer | Mean absolute error | Within 25% | Avg latency |
|---|---|---|---|
| Heuristic (no model) | **16.3 min** | 9/10 | 0 ms |
| Nemotron, zero-shot | 35.3 min | 8/10 | 7.6 s |

The worst miss: **"Quiz 3 prep" came back at 240 minutes against 50 actual.**

## Why it missed

Not the model. Our prompt. It listed bands as "problem sets 60-150, readings 20-60, essays 120-300, exams prep 180-360, gym 45-90" and said nothing about quizzes. A quiz is not an exam, but the only nearby band was exam prep, so the model reached for 240. The heuristic happened to be right because it has a separate rule for the word "quiz".

A second finding came out of the same run: one call took 30 seconds. The client tries a schema-constrained request first and retries without the schema on failure, each with its own 15-second budget. A timeout was being treated as a schema rejection, so a slow endpoint cost double.

## The fixes

**Anchor the model instead of trusting it.** The anchored variant hands Nemotron the heuristic as a baseline and asks it to adjust only where the title is informative. Code then clamps the answer to between half and double the baseline. The model can still correct a bad rule, which is the point of having it, but a five-times miss is structurally impossible rather than merely discouraged. For "Quiz 3 prep" the baseline is 45, so the clamp window is 23 to 90 and 240 cannot happen. That is not a claim about a prompt: the clamp lives in `src/core/estimator.ts` as `clampToBaseline`, in the pure core with the rest of the arithmetic, and `src/core/__tests__/clamp.test.ts` proves it **with no key and no network** — including the original 240 collapsing to 90, and a property test that no model output at all, up to 100000, can leave the window for any title in the eval set. The clamp fires only when a model actually answered; clamping the heuristic against a window derived from the heuristic would be a permanent no-op reported as `clampFired: 0`, which would read as evidence the model behaved.

**Do not retry a timeout.** Only a schema rejection is worth a second attempt. This halves the worst case.

Both variants stay in the code and in the eval. The zero-shot prompt is unchanged on purpose so the failure remains reproducible.

## Run 2: three scorers

`GET /api/eval` now runs the heuristic, zero-shot, and anchored on the same ten tasks, in parallel, and reports mean absolute error, within-25% rate, the worst single miss, latency, how often the clamp fired, how many calls the model actually answered, and which model id served them.

| Scorer | MAE | Within 25% | Clamp fired | Avg latency |
|---|---|---|---|---|
| Heuristic | 16.3 min | 9/10 | n/a | 0 ms |
| Nemotron zero-shot | 35.3 min | 8/10 | n/a | 7.6 s |
| Nemotron anchored + code clamp | 17.1 min | 9/10 | 0 | 7.3 s |

**Run with a key (2026-09-19, Jatin, posted to #4):** zero-shot re-measured at 33.8 (worst miss still "Quiz 3 prep" 240 vs 50); anchored lands at 17.1, level with the heuristic instead of twice as bad. Two caveats on these exact numbers: only 4/10 zero-shot and 6/10 anchored calls were actually answered by the model before a 15 s timeout or a 429, so both model rows are partly the heuristic's own score, which flatters zero-shot and understates the gap; and `clampFired: 0` means the anchored answers were already inside the window, not that the clamp is inert. Hosted latency is 7 to 10 s and spiky, which is why nothing on the voice path waits on it.

**Run without a key (2026-09-19 16:55, lead):** all three rows come back identical at MAE 16.3, 9/10, because both model variants report `answeredByModel: 0/10` and fall back to the heuristic ten times out of ten with `errors: ["no NVIDIA_API_KEY"]`. That is the harness being honest rather than the model being useless, but it means **this table carries no signal until the key is present** — three copies of one number reads as "the model does nothing". The clamp row is the part that does not need the key: see `clamp.test.ts`.

## What this says about the architecture

The estimator was never meant to be a model on its own. The per-course calibration in `src/core/estimator.ts` corrects your guesses after five real sessions and caps the multiplier at three, and that is what makes the number trustworthy over a term. The model's job is the cold start, the first estimate before any sessions exist, and the anchored design says exactly that: start from a rule, let the model nudge it, let real data replace both.

## Parse

The same run surfaced a bug in our own code. The hosted `nvidia/nemotron-parse` endpoint returns `tool_calls[0].function.arguments` as a JSON array of arrays, one inner array per image, with boxes normalized 0 to 1 rather than in pixels. Our normalizer read the outer array as the element list, produced a single empty element, and lost every box. Fixed by flattening one level, with tests against the recorded shape in `src/core/__tests__/parse.test.ts`.

Two limits worth stating: `nemotron-parse-2.0` is not usable for a full page (4096-token context without tools, HTTP 400 with them), and the model drops checkbox glyphs, so a syllabus line like "[ ] Read Chapter 3" loses its box state. The verbatim-quote guard in `syllabus.ts` did its job in the same test and rejected an invented "Syllabus Quiz" task that appeared nowhere in the document.

## Reproduce

```
NVIDIA_API_KEY=... in .env.local
npm run dev
curl localhost:3123/api/eval | jq .summary
curl localhost:3123/api/eval?variant=anchored | jq .detail.anchored
```
