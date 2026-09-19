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
 * fine for the ElevenLabs webhook, which has to be re-pasted every time the
 * URL changes. Deploy to Vercel before wiring the voice agent for real.
 *
 *   node scripts/tunnel.mjs [port]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = process.argv[2] ?? "3123";
const URL_FILE = ".tunnel-url.txt";

const CANDIDATES = [
  process.env.CLOUDFLARED,
  "C:/Program Files (x86)/cloudflared/cloudflared.exe",
  "C:/Program Files/cloudflared/cloudflared.exe",
  "cloudflared",
].filter(Boolean);

const BIN = CANDIDATES.find((p) => p === "cloudflared" || fs.existsSync(path.normalize(p))) ?? "cloudflared";

let current = "";

function start() {
  console.log(`starting ${BIN} -> http://localhost:${PORT}`);
  const p = spawn(BIN, ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });

  const scan = (buf) => {
    const line = buf.toString();
    process.stdout.write(line);
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== current) {
      current = m[0];
      fs.writeFileSync(URL_FILE, current + "\n");
      console.log(`\n>>> PUBLIC URL: ${current}\n>>> written to ${URL_FILE}\n`);
    }
  };

  p.stdout.on("data", scan);
  p.stderr.on("data", scan);
  p.on("error", (e) => console.error("spawn failed:", e.message));
  p.on("exit", (code) => {
    console.log(`\n>>> tunnel exited (${code}), restarting in 3s\n`);
    current = "";
    setTimeout(start, 3000);
  });
}

start();
