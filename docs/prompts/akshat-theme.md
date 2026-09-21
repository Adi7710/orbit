# Brief: ideation, theme, and the game economy (Akshat)

This brief covers the product and narrative for Orbit at SteelHacks XIII. Read `CONTRIBUTING.md` and `DECISIONS.md` first. Akshat designed the original Orbit idea and owns what it feels like, what it says, and why it wins. You write documents, copy, design tokens, and the pitch. You do not write application code unless a doc requires a tiny token file. Other sessions will build exactly what your docs say, so be specific.

## Absolute constraint
You may reuse the original Orbit design ideas (the honest ledger, gap finder, rings, modes, estimate calibration). You may not reuse or reference any earlier code. Ideas are allowed; files are not. Say this in `docs/origin.md` in two sentences so judges see we know the rule.

## Deliverables, in order, each committed the moment it is done
1. `docs/theme.md`: the metaphor and the tokens. Orbit = your day has gravity; classes are fixed bodies, gaps are orbits you can use, rings fill, streaks are momentum, crisis mode is "reduced gravity". Define: the four ring domains (learn, build, body, life) with hex colors that pass contrast on light and dark and are distinguishable under deuteranopia (state the check you did), typography scale, corner radius, motion rules (Reduce Motion respected), and the voice of the app (playful, never cringe, never shaming; examples of five good lines and five banned lines). Anmol's iOS session and Adi's web work both consume this file.
2. `docs/economy.md`: the game economy. XP sources and caps (the server already implements: planned minutes worked, in-gap bonus 15, on-time bonus 25, honesty scaling, per-task cap 150, daily cap 400, streak multiplier 10 percent per week up to five, zero XP in crisis and chill, streaks never break). Add: quest taxonomy (task quests, bus quests, social quests, body quests), how quests expire, what a "ring close" means per domain, leaderboard groups (dorm, major, friends) and why the math never changes per group, anti-farming rules in plain language, and the weekly reset. Include three worked examples with numbers. If you want to change a number in the server rules, write the change here and open an issue for Adi; do not edit `src/core/game.ts` yourself.
3. `docs/copy.md`: every string the app shows, keyed by screen and state: empty states, XP toasts, crisis and chill explanations, the bus ghost warning, the extension-email template rules (under 120 words, cites the ledger numbers, no excuses), the morning briefing template, and the evening check-in question. Keep each line under 12 words where possible.
4. `docs/pitch.md`: the 90-second demo script and the 3-minute pitch. Open with the number ("your calendar thinks 13 hours 35 minutes; you have 9 hours 49"). One flow, no feature tour. Name the tracks and the sentence for each judge: NVIDIA ("Nemotron estimates and parses, and here is the eval table with a failure we found"), ElevenLabs ("the briefing is built from the ledger, and 'I'm in crisis mode' flips the app"), Xtract ("every deadline points at the line on the syllabus it came from"), general ("the honest ledger plus an agent that proposes and a human who approves"). Include the what-could-go-wrong slide: farming, over-committed days, wrong estimates, privacy of friends' schedules, agent errors, and the mitigation for each.
5. `docs/origin.md`: two paragraphs on the idea's origin and the from-scratch rebuild, for the README and Devpost.
6. Keep `DECISIONS.md` coherent: at each checkpoint (T+4, T+10, T+18) read it top to bottom, resolve contradictions by opening an issue tagged `lead`, and append a "checkpoint summary" entry.

## Research you may do
Look at how Duolingo, Strava, and Apple Fitness handle streaks, caps and social pressure, and write down in `docs/economy.md` which patterns we copy and which we reject (reject anything that punishes a bad day). Look at three winning hackathon demos from 2026 for pacing (TreeHacks Shepherd, Cal Hacks FaceTimeOS, HackRice Poker Face) and note in `docs/pitch.md` what they did in the first 15 seconds.

## Rules
- Docs are Markdown in `docs/`. Commit each one separately with a message like "docs: theme tokens".
- Every choice with a consequence (a color, a cap, a banned word) gets a DECISIONS.md line.
- Ask the lead (issue tagged `lead`) before changing any number the server already enforces.
- Done means Anmol can build a screen from `docs/theme.md` and `docs/copy.md` without asking a question.
