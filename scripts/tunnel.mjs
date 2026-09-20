#!/usr/bin/env node
/**
 * Public URL for the dev server without an account.
 *
 * Cloudflare quick tunnels are ephemeral: the one we started at 15:30 was
 * revoked about an hour later with "Tunnel not found". This supervises it,
 * writes the current URL to .tunnel-url.txt, and restarts on death so the
 * team always has somewhere to point.
 *
 * A changing URL is fine for browsing and for the iOS simulator. It is NOT
 * fine for the ElevenLabs webhook: the registered tools keep pointing at a
 * host that no longer resolves, and the agent does not fail loudly in that
 * state -- it calls a dead webhook, gets nothing back, and improvises around
 * the missing numbers, which is the one behaviour the whole voice design
 * exists to prevent. So every time the URL changes we re-point the tools in
 * place, before anybody notices. Tool ids and the agent id do not change, so
 * nothing has to restart.
 *
 * ## Why there is a watchdog
 *
 * The first version of this supervised the wrong thing. It restarted the
 * tunnel on `exit`, which sounds right and is useless: when Cloudflare revokes
 * a quick tunnel, cloudflared does not exit. It logs
 *
 *     ERR Register tunnel error from server side error="Unauthorized: Tunnel not found"
 *     INF Retrying connection in up to 1m4s
 *
 * and loops on that forever. A quick tunnel's hostname is issued at
 * registration, so retrying a revoked id can never produce a new one -- the
 * process is alive, the log is scrolling, and the URL has been dead for ten
 * minutes. We lost the voice demo to exactly that, undetected, because the
 * supervisor was watching liveness when the thing that matters is
 * reachability.
 *
 * So health is measured from outside: fetch our own public URL on a timer. If
 * it stops answering, kill cloudflared and let the restart path get a fresh
 * hostname. Being alive is not the same as being reachable, and only one of
 * them is what a judge experiences.
 *
 *   node scripts/tunnel.mjs [port]
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { repoint } from "./repoint-voice.mjs";

const PORT = process.argv[2] ?? "3123";
const URL_FILE = ".tunnel-url.txt";

/** How often to ask the public URL whether it is still there. */
const PROBE_MS = 20_000;
/** Consecutive failures before we stop believing the tunnel. Three probes is
 *  about a minute, which is long enough to ride out a blip and short enough
 *  that nobody is mid-sentence when it heals. */
const PROBE_STRIKES = 3;
/** If cloudflared has not produced a URL by now, registration is failing from
 *  the outset and no amount of waiting will fix it. */
const URL_GRACE_MS = 90_000;

const CANDIDATES = [
  process.env.CLOUDFLARED,
  "C:/Program Files (x86)/cloudflared/cloudflared.exe",
  "C:/Program Files/cloudflared/cloudflared.exe",
  "cloudflared",
].filter(Boolean);

const BIN = CANDIDATES.find((p) => p === "cloudflared" || fs.existsSync(path.normalize(p))) ?? "cloudflared";

let current = "";
/** Bumped on every spawn so a timer from a dead generation cannot kill a live
 *  tunnel -- the bug class that makes supervisors worse than nothing. */
let generation = 0;
let restarts = 0;

/**
 * Point the voice tools at the URL we just got. Never let this kill the
 * tunnel: a browsable URL with stale voice tools is much better than no URL
 * at all, so a failure here is loud in the log and otherwise ignored.
 */
async function follow(url) {
  try {
    const { changed, checked } = await repoint(url, (l) => console.log(l));
    console.log(changed ? `>>> voice tools re-pointed (${changed}/${checked})\n` : `>>> voice tools already correct (${checked})\n`);
  } catch (e) {
    console.error(`>>> could not re-point voice tools: ${e.message}`);
    console.error(`>>> voice will be dead until you run: node scripts/repoint-voice.mjs\n`);
  }
}

/** True if the public URL answers. /api/today is the cheapest honest probe we
 *  have: it is the endpoint the voice tools actually depend on, it needs no
 *  secret, and it returns in about 10ms. */
async function reachable(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(`${url}/api/today`, { signal: ac.signal, cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** cloudflared on Windows does not reliably die from a signal, and a survivor
 *  holding the port is worse than the dead tunnel we are replacing. */
function hardKill(child) {
  try {
    if (process.platform === "win32" && child.pid) {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    try { child.kill(); } catch { /* already gone */ }
  }
}

function start() {
  const mine = ++generation;
  console.log(`starting ${BIN} -> http://localhost:${PORT}  (generation ${mine})`);
  const p = spawn(BIN, ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });

  let strikes = 0;
  let sawUrl = false;
  let probe;

  /** Replace this tunnel. Safe to call twice: the generation check makes the
   *  second call a no-op. */
  const recycle = (why) => {
    if (mine !== generation) return;
    console.error(`\n>>> ${why}\n>>> replacing the tunnel to get a fresh hostname\n`);
    clearInterval(probe);
    generation++;              // orphan every timer still holding `mine`
    // Forget the dead hostname. `current` is shared across generations, and
    // leaving it set means the next tunnel probes the corpse it just replaced,
    // collects three strikes before it has even registered, and recycles
    // itself -- a watchdog that eats its own tunnels.
    current = "";
    hardKill(p);
    setTimeout(start, 2000);
  };

  const scan = (buf) => {
    const line = buf.toString();
    process.stdout.write(line);
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== current) {
      sawUrl = true;
      strikes = 0;
      current = m[0];
      fs.writeFileSync(URL_FILE, current + "\n");
      console.log(`\n>>> PUBLIC URL: ${current}\n>>> written to ${URL_FILE}\n`);
      follow(current);
    }
  };

  p.stdout.on("data", scan);
  p.stderr.on("data", scan);
  p.on("error", (e) => console.error("spawn failed:", e.message));
  p.on("exit", (code) => {
    if (mine !== generation) return;   // we killed it on purpose; recycle owns the restart
    clearInterval(probe);
    console.log(`\n>>> tunnel exited (${code}), restarting in 3s\n`);
    current = "";
    generation++;
    setTimeout(start, 3000);
  });

  // Registration failing from the very first attempt looks identical to a slow
  // start for about a minute, so give it one and then stop waiting.
  setTimeout(() => {
    if (mine === generation && !sawUrl) recycle(`no public URL after ${URL_GRACE_MS / 1000}s -- registration is failing`);
  }, URL_GRACE_MS);

  probe = setInterval(async () => {
    if (mine !== generation || !current) return;
    if (await reachable(current)) {
      if (strikes) console.log(`>>> tunnel answering again after ${strikes} missed probe(s)`);
      strikes = 0;
      restarts = 0;
      return;
    }
    strikes++;
    console.error(`>>> tunnel did not answer (${strikes}/${PROBE_STRIKES}): ${current}`);
    if (strikes >= PROBE_STRIKES) {
      // Back off a little if this keeps happening, so a dev server that is
      // simply down does not turn into a tunnel-spawning loop.
      const wait = Math.min(30_000, 2000 * 2 ** restarts++);
      console.error(`>>> backing off ${wait / 1000}s before the next tunnel`);
      clearInterval(probe);
      setTimeout(() => recycle(`${PROBE_STRIKES} consecutive probes failed -- the hostname is dead`), wait);
    }
  }, PROBE_MS);
}

start();
