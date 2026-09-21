# Contributing to Orbit

Read this, then `DECISIONS.md`, before changing anything. These are the rules the codebase was built under; they are what keep the two clients, the voice and the ledger from ever disagreeing.

## What Orbit is

Your calendar says you have 13h 35m free today. You have 9h 07m, because nobody counts the walk between buildings, the meals, and the settling in. Orbit counts them, finds the real windows between classes, puts one thing in each, tells you when to stand up for the train, and turns the day into quests you can only complete by doing the work. It is honest about time, and it never counts what you failed to do.

## The three rules

1. **The client never computes a number.** Every minute, XP value and time arrives from the server already worded. The phone and the web page cannot disagree, because there is one arithmetic and it lives in `src/core/`.
2. **The model never computes a number either.** Voice tools return finished sentences. Open questions are answered from an enumerable factsheet and checked — an answer containing a number the facts did not license is rejected before anyone hears it.
3. **Agents propose, humans approve.** Only `/api/proposals/[id]` turns a proposal into an action. No agent has a tool that books, sends, moves or pays.

## Architecture boundaries

- **`src/core/`** is pure TypeScript: no framework imports, no network, fully unit-tested. If you change arithmetic here, update the hand-computed expectations in `src/core/__tests__/` and say why in `DECISIONS.md`.
- **`src/agents/`** holds model calls. Agents propose; they never execute.
- **`src/lib/store.ts`** is the in-memory store. Keep its shape; a Postgres implementation must expose the same functions.
- **`src/app/api/*`** is the contract the web app and the iOS app both consume. Changing a response shape means updating `src/app/TodayClient.tsx`, the models in `ios/`, and `DECISIONS.md`.
- **`src/agents/models.ts`** is the model registry: Nemotron via the NVIDIA hosted API, and the Anthropic SDK for the planner's second tier and the Email Agent. Every model call records which provider answered, so degraded mode is visible rather than silent.
- **`src/core/game.ts`**: XP is computed server-side, capped, and only awarded for planned minutes actually worked. A client may never send XP.

## The decision log

Every non-trivial decision goes in `DECISIONS.md`, appended in the format already there: date, who, decision, why, what it affects. That includes a library you added, a schema you changed, an API shape you chose, a feature you cut, a design token you set, a prompt you rewrote, a fallback you took. Append, never rewrite. Commit it with the work it describes.

## Conventions

- Branch per change, PR into `main`. `npm run typecheck`, `npx vitest run` and `npx next build` must pass before you open one — CI runs exactly those.
- Small commits with plain messages.
- Windows and macOS are both in use. Use `path` helpers, never hard-coded slashes. LF line endings.
- No new dependency without a line in `DECISIONS.md`. Prefer what is installed.
- Every feature must work with no API keys present, via a deterministic fallback, and must **degrade visibly, not silently**.
- Keys live in `.env.local` only. Never commit them, never log them, never paste them anywhere.
- Synthetic data only in the repository. No real student records, no real credentials. Instructor addresses ship on `@example.edu`, which cannot deliver.

## Timezone

Orbit is a clock. The domain is a student in New Jersey and the production code pins `America/New_York` in several places; `vitest.config.mts` pins it too, so the suite does not pass in one zone and fail in another.

## iOS

`ios/Orbit/Orbit.xcodeproj` is generated from `project.yml` by XcodeGen. If you add a Swift file, run `xcodegen generate` and commit the regenerated project with it, or the file is on disk and in no target. `ORBIT_API_BASE` is the one place the server URL is set; the app holds no keys.
