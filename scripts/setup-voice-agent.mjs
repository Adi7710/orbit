#!/usr/bin/env node
/**
 * Creates (or updates) Orbit's voice agent and its server tools through
 * the ElevenLabs API, so the whole thing is reproducible instead of a dozen
 * clicks somebody has to remember.
 *
 *   node scripts/setup-voice-agent.mjs                 # uses .tunnel-url.txt
 *   node scripts/setup-voice-agent.mjs https://your.vercel.app
 *
 * Writes ELEVENLABS_AGENT_ID back into .env.local. Re-running it replaces the
 * tools and the agent rather than piling up duplicates, which matters because
 * the webhook URL changes every time the tunnel rotates.
 */
import fs from "node:fs";
import { FIRST_MESSAGE, SYSTEM_PROMPT, conversationConfig } from "./voice-config.mjs";

const API = "https://api.elevenlabs.io/v1";
const ENV = ".env.local";

function env(key) {
  const line = fs.readFileSync(ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, "") : "";
}
function setEnv(key, value) {
  const lines = fs.readFileSync(ENV, "utf8").split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV, lines.join("\n"));
}

const KEY = env("ELEVENLABS_API_KEY");
const SECRET = env("VOICE_TOOL_SECRET");
const BASE = (process.argv[2] ?? fs.readFileSync(".tunnel-url.txt", "utf8").trim()).replace(/\/$/, "");
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing from .env.local");
if (!BASE.startsWith("https://")) throw new Error(`webhook base must be https, got ${BASE}`);

const call = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 400)}`);
  return body;
};

/** Four tools. The name is in the URL; the model only supplies arguments. */
const TOOLS = [
  {
    name: "get_today",
    description:
      "Read the student's day: how many usable minutes they really have versus what their calendar claims, their best free window, and whether the day still fits. Call this whenever they ask what their day looks like, how much time they have, or what they should do next. Takes no arguments.",
    body: {},
  },
  {
    name: "log_actual",
    description:
      "Record that the student finished a task and how many minutes it actually took. Call this the moment they say something is done, for example 'the problem set took ninety-five minutes' or 'I just finished the essay, about two hours'. This is the single most valuable thing you can capture, because it teaches Orbit how long that student's work really takes. If they say a task name you are unsure about, still call this with your best transcription; the server will ask which one it was.",
    body: {
      task: { type: "string", description: "The task as the student said it, for example 'the problem set' or 'my essay draft'. Do not invent a name." },
      minutes: { type: "integer", description: "How many minutes it actually took, as a whole number." },
    },
    required: ["task", "minutes"],
  },
  {
    name: "set_mode",
    description:
      "Change the student's mode. 'crisis' when they say today is a crisis or they are overwhelmed: only coursework stays and XP pauses, with no damage to their streak. 'chill' when they want a light day. 'normal' to go back. Call this as soon as they say it, without asking them to confirm.",
    body: { mode: { type: "string", description: "One of: normal, crisis, chill" } },
    required: ["mode"],
  },
  {
    name: "get_bus",
    description:
      "Work out when the student should stand up to catch their bus, using Pittsburgh Regional Transit live data, and whether they will make their next class. Call this for any question about leaving, the bus, being late, or getting to class or home.",
    body: { destination: { type: "string", description: "Optional building name such as Cathedral, Hillman, Posvar, Sennott, Benedum, or Home. Leave empty to use their next class." } },
  },
  {
    name: "get_estimate",
    description:
      "Tell the student how long a specific task will really take THEM, based on their own history, and which gap it fits. Call this for questions like 'how long will the problem set take me', 'how much time should I give the essay', or 'will the lab report fit before class'. Pass the task as they said it.",
    body: { task: { type: "string", description: "The task as the student said it, for example 'the problem set' or 'the lab report'." } },
    required: ["task"],
  },
  {
    name: "get_coach",
    description:
      "Tell the student what their own history says about how they work: when they are fastest, which kinds of work take longer than they guess, and how close to deadlines they finish. Call this for 'how am I doing', 'when do I work best', 'what should I change', or 'any tips'. Takes no arguments.",
    body: {},
  },
];

const LLM_CANDIDATES = ["claude-sonnet-4-5", "claude-3-7-sonnet", "claude-3-5-sonnet", "gemini-2.5-flash", "gpt-4o"];
// English agents are restricted to the turbo/flash v2 families.
const TTS_CANDIDATES = ["eleven_flash_v2", "eleven_turbo_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"];

async function main() {
  console.log(`webhook base: ${BASE}`);

  // Replace any tools we made earlier, so a rotated tunnel URL does not leave stale ones behind.
  const existing = await call("/convai/tools").catch(() => ({ tools: [] }));
  for (const t of existing.tools ?? []) {
    const name = t.tool_config?.name ?? t.name;
    if (TOOLS.some((x) => x.name === name)) {
      // force=true is required, not optional. A tool attached to an agent --
      // or, worse, to a *branch* of an agent that has already been deleted --
      // returns 409 and stays. The original code swallowed that error and
      // printed "removed" anyway, so every re-run silently doubled the
      // registry: ten tools with duplicate names, four of them pointing at
      // nothing. Report what actually happened instead of what we intended.
      const res = await call(`/convai/tools/${t.id}?force=true`, { method: "DELETE" })
        .then(() => "removed")
        .catch((e) => `COULD NOT REMOVE (${String(e.message).slice(-60)})`);
      console.log(`  ${res} old tool ${name}`);
    }
  }

  const toolIds = [];
  for (const t of TOOLS) {
    const created = await call("/convai/tools", {
      method: "POST",
      body: JSON.stringify({
        tool_config: {
          type: "webhook",
          name: t.name,
          description: t.description,
          response_timeout_secs: 20,
          api_schema: {
            url: `${BASE}/api/voice/tool?tool=${t.name}`,
            method: "POST",
            request_headers: SECRET ? { "x-orbit-secret": SECRET } : {},
            // A POST tool must declare a body schema even when it takes no
            // arguments, so tools like get_today send an empty object.
            request_body_schema: {
              type: "object",
              description: `Arguments for ${t.name}`,
              properties: Object.fromEntries(Object.entries(t.body).map(([k, v]) => [k, { ...v }])),
              required: t.required ?? [],
            },
          },
        },
      }),
    });
    const id = created.id ?? created.tool_id;
    toolIds.push(id);
    console.log(`  tool ${t.name} -> ${id}`);
  }

  let lastError;
  for (const tts of TTS_CANDIDATES) {
  for (const llm of LLM_CANDIDATES) {
    try {
      const agent = await call("/convai/agents/create", {
        method: "POST",
        body: JSON.stringify({
          name: "Orbit",
          conversation_config: {
            agent: {
              first_message: FIRST_MESSAGE,
              language: "en",
              prompt: { prompt: SYSTEM_PROMPT, llm, temperature: 0.3, tool_ids: toolIds },
            },
            ...conversationConfig(),
            tts: { ...conversationConfig().tts, model_id: tts },
            conversation: { max_duration_seconds: 300 },
          },
        }),
      });
      const id = agent.agent_id ?? agent.id;
      setEnv("ELEVENLABS_AGENT_ID", id);
      console.log(`\nagent created with llm=${llm}`);
      console.log(`ELEVENLABS_AGENT_ID=${id} written to ${ENV}`);
      console.log(`\nRestart the dev server so it picks up the agent id.`);
      return;
    } catch (e) {
      lastError = e;
      const msg = String(e.message);
      // Only cycle the LLM when the LLM is what was rejected; anything else
      // means trying five more models just wastes time on the same error.
      if (!/llm|model/i.test(msg) || /turbo or flash/i.test(msg)) { console.log(`  tts=${tts}: ${msg.slice(-90)}`); break; }
      console.log(`  llm ${llm} rejected`);
    }
  }
  }
  throw lastError;
}

main().catch((e) => { console.error("\nsetup failed:", e.message); process.exit(1); });
