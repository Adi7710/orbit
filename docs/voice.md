# Orbit's voice agent: plan

## Why voice at all

A student with a free hand can tap. Voice only earns its place when the hands or the eyes are busy, and for Orbit there are exactly four of those moments:

1. **Walking out of a class.** "What's next and where." You cannot read a screen crossing Forbes.
2. **Getting ready in the morning.** The briefing, while packing a bag.
3. **The second after finishing work.** "That took me ninety-five minutes." This is the one that matters most: the estimator only gets smart if actual minutes get captured, and nobody ever types them. Voice removes the friction from the single input the whole product depends on.
4. **Deciding whether to run for the bus.** "Do I make my two-thirty?"

Everything below serves those four. If a feature does not fit one of them, it does not belong in the voice agent.

## The one design rule

**The server writes the sentence. The model only delivers it.**

Every tool returns a `text` field that is already a finished spoken sentence, composed from the deterministic core. The agent reads it. The model's job is to understand intent and pick a tool, never to generate a number. That means the voice agent cannot hallucinate an XP total, a bus time, or how many minutes you have left, because it never computes one. It is the "LLM in one narrow step" pattern applied to speech.

## What it can do

### Tier 1: the demo (build first)

| Tool | Say | Does | Returns |
|---|---|---|---|
| `get_today` | "What does my day look like?" | Reads the ledger, gaps, next class, mode | "You have nine hours forty-nine minutes, not the thirteen your calendar claims. Your best window is eleven-oh-five to two twenty-one, three hours sixteen." |
| `log_actual` | "The problem set took me ninety-five minutes" | Resolves the task by name, completes it, feeds the estimator, awards XP | "Ninety-five minutes, logged. A hundred forty-three XP for finishing it in a planned gap, on time. Your MATH 0220 estimates are now one point six times what you guess." |
| `set_mode` | "I'm in crisis mode" | Flips mode; UI visibly changes | "Crisis mode. Only coursework from here. XP is paused and your streak is safe." |
| `get_bus` | "When do I leave for class?" | Calls the journey endpoint | "Leave in eight minutes. The sixty-one A is two minutes late and four point seven kilometres out. You are at the Cathedral at two forty-three, forty-six minutes before class." |

### Tier 2: if there is time

| Tool | Say | Does |
|---|---|---|
| `start_focus` / `stop_focus` | "Start the essay" … "done" | Times the session and logs the exact minutes automatically, so `log_actual` stops needing a human to remember |
| `add_task` | "Remind me to email my advisor, fifteen minutes" | Creates a task |
| `list_proposals` | "What do you suggest?" | Reads pending proposals from the day agent |
| `approve_proposal` | "Yes, put it in the two o'clock gap" | Approves **only** `move_task` and `book_room`. Anything that reaches another human (`draft_extension`, `notify_friends`) is refused out loud: "That one needs a tap. It is on your screen." |

That split is deliberate and it is the answer to "what could go wrong": a misheard word can move a task around your own day, but it can never email your professor.

### What it will never do

Approve anything that contacts another person. Move money. Invent a number. Keep listening when you have not pushed the button. Claim a bus is live when the feed is down.

## How it works

```
Browser mic  ──WebRTC──▶  ElevenLabs Agent  ──HTTPS webhook──▶  /api/voice/tool  ──▶  Orbit core
   ▲                      (Claude Sonnet 5,                         │                  (ledger, gaps,
   │                       Flash v2.5 voice,                        │                   estimator, XP,
   └──────audio────────    Scribe v2 ASR)  ◀──{ "text": "…" }───────┘                   journey)
                                   │
                          conversation token
                                   ▲
                          /api/voice/token  (mints it, plus the opening briefing)
```

The agent lives in ElevenLabs' cloud, so **its webhooks must reach a public URL**. Localhost does not work. That makes the deploy or a tunnel the first blocking step, not an afterthought.

### How it takes turns

The default agent felt like a kiosk: it answered the instant you stopped making noise, and it kept listening for ever afterwards. Three changes, all in `scripts/voice-config.mjs` and applied with `node scripts/tune-voice.mjs`:

| Setting | Was | Now | Why |
|---|---|---|---|
| `turn.turn_eagerness` | `normal` | **`patient`** | On `normal` the first gap in your speech is its cue, so thinking mid-sentence gets you interrupted. Patient waits until you are actually done. The beat of latency this costs is the beat that makes it feel considered. |
| `turn.turn_timeout` | `7` | **`-1`** | Disables "are you still there?". With push-to-talk the mic is muted between turns, so the agent would be talking into a silence it created and cannot hear out of. |
| `turn.soft_timeout_config` | off | **1.0 s, varied fillers** | When a tool genuinely takes a second, a friend says "let me look" rather than going quiet. |
| `tts.optimize_streaming_latency` | `3` | **`1`** | 3 is aggressive chunking: it starts fast and sounds clipped because it commits to the start of a sentence before knowing the end. |
| `tts.speed` | `1` | **`0.95`** | Stops it sounding rushed. |

`reasoning_effort` is **not available** to us: the API rejects it for `claude-sonnet-4-5` with "Reasoning effort is not supported for this LLM", so there is no literal model-thinking pause to buy. The patience and the fillers are what produce the conversational beat instead.

The microphone is muted between turns (`setMicMuted`), so Orbit no longer answers other people's conversations. Holding the button while it is still speaking is how you interrupt it, which is the one always-listening behaviour worth keeping. `tune-voice.mjs` sends only turn-taking, pacing and the prompt; `tool_ids` and the LLM are left untouched, so tuning the personality can never detach the tools.

### When the tunnel rotates, the tools follow it

A Cloudflare quick tunnel is ephemeral; ours was revoked about an hour after it started. When the URL changes, the four registered tools keep pointing at a host that no longer resolves, and **this failure is silent in the worst possible way**: the agent calls a dead webhook, gets nothing back, and improvises around the missing numbers. Inventing a number is the single thing the whole server-composes-the-sentence design exists to prevent, so a rotated tunnel does not merely break voice, it turns voice into the failure mode we promised judges we had engineered away.

So the URL follows the tunnel automatically. `scripts/tunnel.mjs` now calls `repoint()` the moment it sees a new URL:

```
>>> PUBLIC URL: https://departmental-discussion-inf-whats.trycloudflare.com
  get_bus -> …/api/voice/tool?tool=get_bus
  …
>>> voice tools re-pointed (4/4)
```

`scripts/repoint-voice.mjs` **PATCHes `api_schema.url` in place** on the four tools it recognises by name. This is deliberately not `setup-voice-agent.mjs`, which deletes the tools, recreates them, creates a *new* agent and writes a new `ELEVENLABS_AGENT_ID` that only takes effect after a dev-server restart. That is fine once, at the start; it is not something you can do while a judge is holding the microphone. Because only the URL changes, tool ids stay valid, `ELEVENLABS_AGENT_ID` stays the same, and nothing restarts.

Run it by hand if you ever need to, including to point the agent at a Vercel deployment:

```
node scripts/repoint-voice.mjs                        # uses .tunnel-url.txt
node scripts/repoint-voice.mjs https://your.vercel.app
```

If re-pointing fails, the tunnel still comes up and the log says exactly what to run. A browsable URL with stale voice tools beats no URL at all.

Latency budget per turn: about 150 ms speech to text, a few hundred milliseconds for Claude with a tool call, 75 ms text to speech, plus roughly half a second of player buffer. Call it one to two seconds from the end of your sentence to the first word back. Any tool slower than 400 ms gets a spoken filler first ("let me check").

## Keys and accounts

| What | Where it goes | Required | Notes |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | `.env.local` | Yes | elevenlabs.io profile. The SteelHacks track gives every participant a free Creator month; claim that first. |
| `ELEVENLABS_AGENT_ID` | `.env.local` | Yes | Created in the ElevenLabs dashboard, step 2 below. |
| `VOICE_TOOL_SECRET` | `.env.local` and the tool headers | Yes | Any random string we invent. Sent as `x-orbit-secret` so only our agent can call the webhook. |
| A public HTTPS URL | The tool config in the dashboard | Yes | Vercel deployment, or `ngrok http 3123` during development. |
| Anthropic key | Not needed for voice | No | The agent uses ElevenLabs' native Claude Sonnet 5 and the LLM cost comes out of ElevenLabs credits, not our $25. |
| Twilio SID, token, number | Only for phone calls | No | Skip unless we add the 8 a.m. outbound briefing. |

Free tier is 15 agent minutes a month, which testing eats quickly, so claim the Creator month before the first rehearsal and keep each test under a minute.

## What exists already

- `src/app/api/voice/token/route.ts` mints the WebRTC conversation token and returns the opening briefing text built from the real ledger. Falls back to text-only with a reason when keys are missing.
- `src/app/api/voice/tool/route.ts` handles `get_today`, `set_mode`, `log_actual` and checks `x-orbit-secret`.
- `src/agents/voice.ts` composes the briefing sentence from the ledger.
- `@elevenlabs/react` is installed.

## What is missing

1. **Task resolution.** Voice says "the problem set", the API wants `ps4`. The tool needs fuzzy matching over live task titles, and it must ask rather than guess when two match.
2. **`get_bus`.** The journey endpoint exists; the tool does not call it yet.
3. **A public URL.** Blocking.
4. **The agent itself.** Nothing is created in the ElevenLabs dashboard yet.
5. **The mic button, the transcript, and visible consequences.** Voice with no visible effect is just a chatbot. When the mode flips, cards must fade on screen while the agent is still speaking.

## Conversation design

- **Opens with the briefing, not a greeting.** Never "How can I help you today?"
- **One idea per turn.** The agent says a sentence, then stops.
- **Repeats numbers back before committing.** "Ninety-five minutes, logged." If it mishears, "no, nineteen" corrects it.
- **Asks one specific question when unsure.** "The problem set or the essay?" Never "Could you clarify?"
- **Admits what it cannot reach.** If the webhook fails: "I cannot reach your schedule right now." Never a guess.
- **Ends cleanly.** No "Is there anything else?"
- Tone comes from `docs/copy.md` when Akshat publishes it. Playful, never shaming, never cringe.

## Failure modes and what happens

| Failure | Behaviour |
|---|---|
| Webhook unreachable | Agent says it cannot reach the schedule. No invented numbers. |
| Misheard minutes | Repeated back before commit; one correction turn allowed. |
| Two tasks match the name | Agent asks which, listing both. |
| Microphone permission denied | Text briefing from `/api/voice/token` is shown instead. |
| ElevenLabs minutes exhausted | `token` comes back null with a reason; UI shows the briefing as text and a "voice unavailable" note. |
| Noisy judging room | Push to talk, not always listening. |
| Agent asked something out of scope | "I only know your schedule." |

## Build order

| Step | Owner | Time | Blocking |
|---|---|---|---|
| 1. Deploy to Vercel, or start ngrok, and note the public URL | Jatin or Adi | 20 min | Yes, everything waits on this |
| 2. Create the agent in the dashboard: Claude Sonnet 5, Flash v2.5, warm voice, first message from the briefing | Adi | 20 min | |
| 3. Register the four tier-1 tools pointing at `<public-url>/api/voice/tool` with the `x-orbit-secret` header | Adi | 30 min | |
| 4. Extend `/api/voice/tool`: task-name resolution, `get_bus`, spoken-sentence composition for every branch | Adi | 45 min | |
| 5. Mic button, live transcript, and visible state changes in `TodayClient` | Adi with Jatin | 30 min | |
| 6. Rehearse the four scenarios end to end, then write the failure table into the README | Adi | 20 min | |
| 7. Stretch: focus timer, proposals by voice, iOS voice button | Adi, Anmol | | |

About three hours for a working tier 1.

## Demo script, 40 seconds

Press the mic. The agent opens: "Morning. Your calendar thinks you have thirteen and a half free hours. You actually have nine forty-nine."

"I just finished the problem set, took ninety-five minutes." On screen the card completes and the XP toast fires while the agent says: "Ninety-five minutes, logged. A hundred forty-three XP. Your MATH 0220 estimates are now one point six times what you guess."

"When do I leave for class?" "Leave in eight minutes. The sixty-one A is two minutes late and four point seven kilometres out. You make your three-thirty with forty-six minutes to spare."

"I'm in crisis mode." The non-coursework cards fade on screen. "Crisis mode. Only coursework from here. XP is paused and your streak is safe."
