@AGENTS.md

# Orbit: instructions for every Claude working in this repo

You are one of four Claude sessions working on Orbit in parallel during SteelHacks XIII (Sept 19-20, 2026). A human owns each session. Read this whole file, then `DECISIONS.md`, then your human's file in `prompts/`, before doing anything.

## What Orbit is
Your calendar says you have eleven free hours today. You actually have nine hours forty-nine minutes, because nobody counts the walk between buildings, the meal, and the ten minutes of getting settled. Orbit counts them, finds the real gaps between classes, puts one thing in each gap, tells you when to stand up for the bus, shows which friends are free at the same time, and turns the day into quests you can only complete by actually doing the work. It is a game about time that is honest about time.

## Hard rules (hackathon)
- All code must be new and written after 11:00 AM EST on Sept 19, 2026. Do NOT copy code from any earlier Orbit repository, including the Swift package with the capacity ledger. Re-implement from the idea, never from the file. Violating this disqualifies the whole team.
- Synthetic data only. No real student records, no real credentials.
- Credit AI tools in the README (already done; keep it accurate).
- Keys live in `.env.local` only. Never commit them, never paste them in chat, never log them.

## Decision log (mandatory)
Every non-trivial decision you make goes in `DECISIONS.md` at the repo root, appended in the format shown there: date-time, who, decision, why, what it affects. This includes: a library you added, a schema you changed, an API shape you chose, a feature you cut, a design token you set, a prompt you rewrote, a fallback you took. Other sessions read this file to stay consistent. Append, never rewrite history. Commit it with the work it describes.

## Architecture (do not break these boundaries)
- `src/core/` is pure TypeScript: no framework imports, no network, fully unit-tested (`npm test`). If you change arithmetic here, update the hand-computed expectations in `src/core/__tests__/` and say why in DECISIONS.md.
- `src/agents/` holds model calls. Agents PROPOSE; they never execute. Only `src/app/api/proposals/[id]/route.ts` turns a proposal into an action after a human approves. Do not add a tool that books, sends, moves, or pays directly.
- `src/lib/store.ts` is the in-memory store. Keep its shape; a Postgres implementation must expose the same functions.
- `src/app/api/*` routes are the contract the web app and the iOS app both consume. Changing a response shape requires updating `src/app/TodayClient.tsx`, the iOS models in `ios/`, and DECISIONS.md.
- Model registry (`src/agents/models.ts`): Nemotron via NVIDIA hosted API only (no local models), Claude Sonnet 5 for reasoning and drafting. Every model call must record which provider answered.
- Gamification (`src/core/game.ts`): XP is computed server-side, capped, and only awarded for planned minutes actually worked. Never let a client send XP.

## Conventions
- Branch per issue: `jatin/ics-import`, `adi/day-agent-v2`, `anmol/ios-today`, `akshat/theme`. PR into `main`. `npm test` and `npx tsc --noEmit` must pass before you open a PR. The lead merges.
- Small commits with plain messages. Commit early; git timestamps prove the code started after 11 AM.
- Windows and macOS both in use. Use `path` helpers, never hard-coded slashes. LF line endings.
- No new dependencies without a line in DECISIONS.md. Prefer what is installed: Next 16, React 19, Tailwind 4, zod 4, @anthropic-ai/sdk, @elevenlabs/react, posthog-js, drizzle-orm, postgres, gtfs-realtime-bindings, vitest.
- Demo safety: every feature must work with no API keys present (deterministic fallback) and must degrade visibly, not silently.
- When blocked for more than 20 minutes, comment on your GitHub issue with what you tried and tag the lead. Do not wait silently and do not work around a boundary above.

## Roles and owners
- Adi (Adi7710), lead and agents: Day Agent, Quest Agent, voice agent, syllabus agent tuning, agent evals, approval flow, merges, checkpoints. `prompts/adi-agents.md`.
- Akshat (ak8hat), ideation and theme: product narrative, gamification economy, copy, design tokens, demo script, pitch, keeps DECISIONS.md coherent. `prompts/akshat-theme.md`.
- Anmol (anmolhazari), iOS app: SwiftUI client in `ios/` consuming the same API. `prompts/anmol-ios.md`.
- Jatin (jatinsrivastava11), features and infra: ICS import, Postgres, bookings, Nemotron wiring and `/api/eval`, web syllabus panel, leaderboard page, PRT feed, PostHog, Vercel. `prompts/jatin-features.md`.
When your prompt file conflicts with this file, this file wins.

## Checkpoints (Eastern time, Sept 19-20)
- T+4 (about 3:00 PM Sat): plan → approve works on a deployed URL. Nemotron ids pinned, `/api/eval` real.
- T+10 (about 9:00 PM Sat): syllabus upload with boxes on web; voice mode switch; iOS Today screen on the simulator; docs/theme.md and docs/copy.md done.
- T+18 (about 5:00 AM Sun): feature freeze. Only fixes, README, video, rehearsal after this.
- 10:00 AM Sun: submitted. 11:00 AM is the hard deadline; do not use the last hour.

## Definition of done for the demo
1. Deployed URL shows the honest ledger (real vs claimed), two gaps, bus leave-by, friends free, leaderboard.
2. "Plan my day" produces proposals; approving one shows a visible effect.
3. Completing a task with real minutes shows XP with reasons and updates the calibration multiplier.
4. Crisis mode by voice.
5. Syllabus page upload produces tasks with bounding boxes drawn on the page.
6. `/api/eval` shows Nemotron vs heuristic (vs fine-tuned, if the Brev run lands).
7. iOS app shows Today and can approve a proposal against the deployed API.
8. README, 2-minute video, submissions to NVIDIA, ElevenLabs, Xtract, General.
