#!/usr/bin/env node
/**
 * Applies Orbit's conversational settings to the live agent, in place.
 *
 *   node scripts/tune-voice.mjs          # apply
 *   node scripts/tune-voice.mjs --show   # print what the agent currently has
 *
 * Same reasoning as repoint-voice.mjs: setup-voice-agent.mjs creates a *new*
 * agent and a new ELEVENLABS_AGENT_ID, which is the wrong shape for a change
 * you want to make ten times while tuning how it feels to talk to. This
 * PATCHes turn-taking, pacing and the prompt onto the agent that already
 * exists, so nothing restarts and the tool ids stay valid.
 *
 * Everything it sends comes from voice-config.mjs, which setup-voice-agent.mjs
 * also uses at create time, so re-creating the agent cannot silently drop the
 * personality.
 */
import fs from "node:fs";
import { FIRST_MESSAGE, SYSTEM_PROMPT, TTS_MODEL, conversationConfig } from "./voice-config.mjs";

const API = "https://api.elevenlabs.io/v1";
const ENV = ".env.local";

function env(key) {
  const line = fs.readFileSync(ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, "") : "";
}

const KEY = env("ELEVENLABS_API_KEY");
const AID = env("ELEVENLABS_AGENT_ID");
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing from .env.local");
if (!AID) throw new Error("ELEVENLABS_AGENT_ID missing from .env.local; run setup-voice-agent.mjs first");

const h = { "xi-api-key": KEY, "Content-Type": "application/json" };

async function show() {
  const a = await (await fetch(`${API}/convai/agents/${AID}`, { headers: h })).json();
  const cc = a.conversation_config ?? {};
  console.log("agent:", AID);
  console.log("  turn_eagerness   :", cc.turn?.turn_eagerness);
  console.log("  turn_timeout     :", cc.turn?.turn_timeout);
  console.log("  soft timeout     :", cc.turn?.soft_timeout_config?.timeout_seconds, `"${cc.turn?.soft_timeout_config?.message}"`);
  console.log("  tts latency/speed:", cc.tts?.optimize_streaming_latency, "/", cc.tts?.speed);
  console.log("  voice_id         :", cc.tts?.voice_id);
  console.log("  tts model        :", cc.tts?.model_id);
  console.log("  llm              :", cc.agent?.prompt?.llm);
  console.log("  tools            :", (cc.agent?.prompt?.tool_ids ?? []).length);
  console.log("  prompt lines     :", String(cc.agent?.prompt?.prompt ?? "").split("\n").filter(Boolean).length);
}

async function apply() {
  const res = await fetch(`${API}/convai/agents/${AID}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({
      conversation_config: {
        ...conversationConfig(),
        // Setting the voice here too means the sound can be fixed without
        // recreating the agent, which would rotate every tool URL with it.
        // voice_id and model_id both come from config/voice.json via conversationConfig().
        tts: { ...conversationConfig().tts, model_id: TTS_MODEL },
        // Only the fields we own. tool_ids and llm are left exactly as they
        // are, so tuning the personality can never detach the tools.
        agent: { first_message: FIRST_MESSAGE, prompt: { prompt: SYSTEM_PROMPT } },
      },
    }),
  });
  if (!res.ok) throw new Error(`PATCH -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  console.log("applied\n");
  await show();
}

(process.argv.includes("--show") ? show() : apply()).catch((e) => {
  console.error("tune failed:", e.message);
  process.exit(1);
});
