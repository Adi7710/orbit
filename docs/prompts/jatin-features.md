# Brief: features and infrastructure (Jatin)

This brief covers building Orbit's features and infrastructure at SteelHacks XIII. Read `CONTRIBUTING.md` and `DECISIONS.md` first. Jatin owns everything that is not an agent, not the iOS app, and not a document: data import, persistence, bookings, the Nemotron wiring and eval, the bus feed, analytics, and deployment. You are the reason the demo works on a URL.

## What exists
Pure core in `src/core/` (tested, do not change arithmetic without updating tests and DECISIONS.md), in-memory store in `src/lib/store.ts`, today builder in `src/lib/today.ts`, API routes in `src/app/api/`, PRT adapter in `src/services/prt.ts` with a demo snapshot, hosted Nemotron registry in `src/agents/models.ts` with a diagnostics route at `/api/nvidia`.

## Your work, in order (each is a GitHub issue; branch per issue, PR into main, `npm test` and `npx tsc --noEmit` green)
1. **#4 Nemotron wiring** (P0, first, 30 minutes): with `NVIDIA_API_KEY` in `.env.local`, open `/api/nvidia`, paste the Nemotron ids it lists into the issue, set `NEMOTRON_MODEL` and `NEMOTRON_PARSE_MODEL` in `.env.local` to ids that exist, run `/api/eval` and confirm `provider: nemotron-hosted` with real latency. If the endpoint rejects `response_format`, the code already retries without it; if it rejects `chat_template_kwargs`, remove that field and log the decision. For Parse: render one syllabus page to PNG (use `pdftoppm` or a screenshot), POST it to `/api/syllabus` as multipart `pages`, paste the raw response shape into issue #6 so Adi's session can adjust the normalizer.
2. **#2 ICS import** (P0): `POST /api/import` accepting `{ timetableUrl?, canvasUrl?, ics? }`. Fetch the URLs server-side, parse with `parseIcs`, replace today's blocks with `blocksOn(today, events, "America/New_York")`, append Canvas events as tasks via `taskFromEvent`, dedupe by uid. Add `data/pitt-tuesday.ics` (synthetic, Pitt buildings, matches the fixture numbers) and `data/canvas-sample.ics`. Add a small import panel to `TodayClient.tsx` (two URL fields and a button). Acceptance: Today shows blocks from the URL and a Canvas assignment appears as a task with `source: canvas`.
3. **#3 bookings** (P1): in `/api/proposals/[id]`, when approving `book_room`, create a booking record (building, gap, confirmation code), reject a second booking for the same gap with 409, and return the booking so the UI can show a ticket card. Same for `notify_friends` (record the invite). Idempotency: approving twice returns the same result.
4. **Deploy** (P0, by T+4): Vercel project from `Adi7710/orbit` (the owner will log in; you prepare `vercel.json` if needed and confirm `next build` passes locally). Set env vars on Vercel. Post the URL in issue #12. Every later PR must not break the build.
5. **PostHog**: `posthog-js` snippet in `src/app/layout.tsx` (client component wrapper), `identify` with the demo user, events `plan_requested`, `proposal_approved`, `task_completed`, `mode_changed`, `syllabus_imported`. Build one funnel in the PostHog UI: plan_requested → proposal_approved → task_completed.
6. **#1 Postgres** (P1, only after the above): drizzle schema mirroring the store (users, tasks, blocks, proposals, events, bookings, board), `DATABASE_URL` optional; empty means in-memory. If you use Tiger Cloud, note it in DECISIONS.md for the MLH Tiger Data prize.
7. **PRT live feed** (P2): if the PRT Developer License is accepted, set `PRT_GTFS_RT_URL` and `DEMO_MODE=false`, verify arrivals for a Forbes Ave stop; otherwise leave the demo snapshot and say so in the README.

## Rules
- Do not change response shapes of existing routes without updating `TodayClient.tsx` and posting in DECISIONS.md; the iOS app consumes them.
- No new dependencies without a DECISIONS.md line.
- Everything must run with no keys present. Test that path before every PR.
- When blocked, comment on the issue with what you tried and tag the lead; do not wait silently.
