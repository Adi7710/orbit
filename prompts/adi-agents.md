# Prompt for Adi's Claude: the agents

Paste everything below this line into your Claude session, in the repo root, after `git pull`.

---

You are building Orbit's agents at SteelHacks XIII. Read `CLAUDE.md` and `DECISIONS.md` first. You are Adi's session. Adi is the team lead and owns everything under `src/agents/` plus the voice agent configuration. The rule that matters most: agents propose, humans approve. If you ever find yourself giving a model a tool that books, sends, moves, or pays, stop and re-read `CLAUDE.md`.

## What exists
- `src/agents/models.ts`: Claude client; Nemotron via NVIDIA hosted API with model-id discovery and JSON-schema calls with fallback.
- `src/agents/dayAgent.ts`: Claude Sonnet 5 with four proposal tools, prompt caching, spend tracker.
- `src/agents/estimate.ts`: Nemotron estimates minutes and domain from a task title (non-chat job, evaluated at `/api/eval`).
- `src/agents/parse.ts` and `syllabus.ts`: Nemotron Parse page image → elements with boxes → dated tasks; items without a verbatim quote are rejected.
- `src/agents/voice.ts`: ElevenLabs token minting and the briefing text.
- `src/app/api/voice/tool/route.ts`: server tools `get_today`, `set_mode`, `log_actual`.

## Your work, in order
1. **Make the Day Agent excellent** (`src/agents/dayAgent.ts`). Rewrite the system prompt with: the persona (a sharp friend who knows your timetable, playful, never shaming), the hard rules (one task per gap, extension only when slack < -60 and due within 72 hours, crisis = coursework only), and three worked examples of good proposals with reasons under 15 words. Add `input_examples` to each tool. Add a `suggest_cut` tool that proposes dropping a task when the day is over-committed, using the reasons the core already computes. Keep `max_tokens` at 900. Verify with `POST /api/plan` that proposals reference real gap and task ids only; add a validation step that drops any proposal whose ids do not exist and logs it as `proposal_rejected`.
2. **Quest Agent** (`src/agents/questAgent.ts`): Nemotron (hosted, JSON schema) turns the deterministic quests from `src/core/game.ts` into one-line playful titles in the app's voice, with the XP and expiry unchanged. Code must verify the model did not change the XP or gap id. Fallback: the deterministic titles. This is a second non-chat Nemotron job for the NVIDIA track; log provider and latency.
3. **Voice agent** (with Anmol's iOS session and the web mic button in mind): in the ElevenLabs dashboard, create the agent (Claude Sonnet 5, Flash v2.5, warm voice). System prompt: it is Orbit's morning voice; first message is the briefing from `/api/voice/token`; it calls `get_today` to answer questions, `set_mode` when the student says crisis or chill, `log_actual` when the student reports how long something took. Add the three server tools with header `x-orbit-secret`. Put `ELEVENLABS_AGENT_ID` and `VOICE_TOOL_SECRET` in `.env.local`. Expose the ngrok URL to the tools during development. Add a mic button to `src/app/TodayClient.tsx` using `useConversation` from `@elevenlabs/react` with `conversationToken` from `/api/voice/token`. Acceptance: say "I'm in crisis mode" and the UI flips within 3 seconds.
4. **Syllabus agent tuning** (`src/agents/syllabus.ts`): once Jatin's session reports the exact Parse response shape in issue #4, adjust `normalize()` in `parse.ts` if needed, tighten the obligation prompt, and write the "failure we found" paragraph into `docs/eval.md` (expected: tables, checkboxes, week-based dates without a calendar).
5. **Agent eval** (`src/app/api/eval-agent/route.ts`): replay 20 synthetic days (vary gaps, slack, modes) through the Day Agent and report: proposals per day, share referencing valid ids, share obeying mode rules, extension drafts only when allowed, cost per day. This is the "evidence it works" for the general judges and a guard against prompt regressions.
6. **Cost discipline**: keep the spend tracker visible; if `claudeSpend.usd` passes $10 before Sunday 6 AM, switch the eval replay to Nemotron and tell the lead.

## Rules
- Prompts are code: keep them in the TypeScript files, not in chat. Every rewrite gets a DECISIONS.md line with the reason.
- Never widen a tool's power. Every new tool returns a proposal type in `Proposal` and nothing else.
- Test with no keys (deterministic fallback must still work) and with keys.
- Branch `agents/*`, PR into main with the `/api/plan` output pasted in the PR body.
