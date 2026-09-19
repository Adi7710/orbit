#!/usr/bin/env node
/**
 * Re-points the existing ElevenLabs tools at a new webhook base, in place.
 *
 *   node scripts/repoint-voice.mjs                       # uses .tunnel-url.txt
 *   node scripts/repoint-voice.mjs https://your.vercel.app
 *
 * Why this exists separately from setup-voice-agent.mjs: that script deletes
 * the tools, recreates them and creates a *new* agent, which writes a new
 * ELEVENLABS_AGENT_ID and needs a dev-server restart to take effect. That is
 * fine once, at the start. It is not something you can do while a judge is
 * holding the microphone.
 *
 * A quick tunnel rotates without warning -- ours was revoked about an hour
 * after it started -- and when it does, the four registered tools keep
 * pointing at a host that no longer resolves. The voice agent does not fail
 * loudly in that state: it calls a dead webhook, gets nothing, and improvises
 * around the missing numbers, which is the one behaviour the whole design
 * exists to prevent. So the URL has to follow the tunnel automatically.
 *
 * This only PATCHes api_schema.url on tools we recognise by name. The tool
 * ids do not change, so the agent's tool_ids stay valid, ELEVENLABS_AGENT_ID
 * stays the same, and nothing has to restart.
 *
 * Exit codes: 0 repointed (or already correct), 1 could not.
 */
import fs from "node:fs";

const API = "https://api.elevenlabs.io/v1";
const ENV = ".env.local";
const NAMES = ["get_today", "log_actual", "set_mode", "get_bus"];

function env(key) {
  if (!fs.existsSync(ENV)) return "";
  const line = fs.readFileSync(ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, "") : "";
}

const KEY = env("ELEVENLABS_API_KEY");
const SECRET = env("VOICE_TOOL_SECRET");

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const shown = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 400);
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${shown}`);
  }
  return body;
}

/**
 * @returns {Promise<{changed: number, checked: number}>}
 */
export async function repoint(base, log = console.log) {
  if (!KEY) throw new Error("ELEVENLABS_API_KEY missing from .env.local");
  const BASE = String(base).trim().replace(/\/$/, "");
  if (!BASE.startsWith("https://")) throw new Error(`webhook base must be https, got ${BASE}`);

  const existing = await call("/convai/tools");
  const mine = (existing.tools ?? []).filter((t) => NAMES.includes(t.tool_config?.name ?? t.name));
  if (mine.length === 0) throw new Error("no Orbit tools registered; run setup-voice-agent.mjs first");

  let changed = 0;
  for (const t of mine) {
    const cfg = t.tool_config ?? {};
    const name = cfg.name ?? t.name;
    const want = `${BASE}/api/voice/tool?tool=${name}`;
    if (cfg.api_schema?.url === want) { log(`  ${name} already correct`); continue; }

    // Send the whole tool_config back with only the url replaced: the API
    // validates the config as a unit, so a partial body loses the schema.
    await call(`/convai/tools/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        tool_config: {
          ...cfg,
          api_schema: {
            ...cfg.api_schema,
            url: want,
            // Re-assert the secret in case it was rotated since the tool was made.
            request_headers: SECRET ? { ...(cfg.api_schema?.request_headers ?? {}), "x-orbit-secret": SECRET } : (cfg.api_schema?.request_headers ?? {}),
          },
        },
      }),
    });
    log(`  ${name} -> ${want}`);
    changed += 1;
  }
  return { changed, checked: mine.length };
}

// Run directly, rather than imported by the tunnel supervisor.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const base = process.argv[2] ?? fs.readFileSync(".tunnel-url.txt", "utf8").trim();
  repoint(base)
    .then(({ changed, checked }) => console.log(changed ? `\nrepointed ${changed}/${checked} tools at ${base}` : `\nall ${checked} tools already at ${base}`))
    .catch((e) => { console.error("\nrepoint failed:", e.message); process.exit(1); });
}
