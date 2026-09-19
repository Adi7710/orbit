# Decisions

Append-only. Every Claude session and every human adds a line for each non-trivial decision. Newest at the bottom. Format:

```
## YYYY-MM-DD HH:MM ET · who · short title
Decision: what was decided.
Why: the reason, in one or two sentences.
Affects: files, routes, or other people's work.
```

## 2026-09-19 13:00 ET · Adi + lead Claude · Rebuild Orbit in TypeScript, web-first
Decision: Orbit is rebuilt from scratch as a Next.js app with a pure TypeScript core; the earlier Swift package is not used.
Why: SteelHacks rules disqualify code written before 11 AM Sept 19; the design is reused, the code is not. Web lets all four people build; iOS is a client on top.
Affects: everything.

## 2026-09-19 13:10 ET · lead Claude · Agents propose, humans approve
Decision: Every agent tool call becomes a pending proposal; only /api/proposals/[id] executes after a human tap.
Why: Winning hackathon agents (LEGR, Citadail) shipped approval gates; it is also the honest answer to "what could go wrong".
Affects: src/agents/dayAgent.ts, src/app/api/proposals, iOS approve screen.

## 2026-09-19 13:15 ET · lead Claude · XP cannot be farmed
Decision: XP is awarded server-side only for planned minutes actually worked, scaled by estimate honesty, capped per task (150) and per day (400); zero XP in crisis and chill, streaks never break.
Why: A leaderboard that can be gamed by creating tasks is worthless within a day.
Affects: src/core/game.ts, /api/complete, leaderboard UI.

## 2026-09-19 13:30 ET · Adi · Hosted Nemotron only
Decision: All Nemotron calls go through NVIDIA's hosted API (build.nvidia.com); no local models on any laptop.
Why: NVIDIA provided API access; team laptops have no NVIDIA GPUs.
Affects: src/agents/models.ts, parse.ts, .env.example.

## 2026-09-19 13:45 ET · Adi · Credits budget
Decision: Claude $25 for the Day Agent only (prompt caching on, spend tracker on /api/plan); Brev $60 reserved for one time-boxed Nemotron Nano fine-tune (stop instance after); Vercel $30 for deploy and Blob; ElevenLabs Creator month for the voice agent with cached morning briefing audio.
Why: Prevent any single loop or idle GPU from consuming the budget before judging.
Affects: src/agents/dayAgent.ts, issue #5.

## 2026-09-19 13:50 ET · Adi · Roles
Decision: Adi = agents; Akshat = ideation, theme, gamification economy, pitch; Anmol = iOS app; Jatin = features and infra.
Why: Matches machines (Mac for iOS), skills, and who proposed what.
Affects: prompts/, GitHub issue assignments.
