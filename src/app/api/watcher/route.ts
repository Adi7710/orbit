import { NextResponse } from "next/server";
import { setWatcherState, tick, watcherStatus, watcherReset, type WatcherState } from "@/agents/watcher";

export const dynamic = "force-dynamic";

/** GET: status and the reasoning trace. */
export async function GET() {
  return NextResponse.json(watcherStatus());
}

/**
 * POST { action }:
 *   tick    run one pass (the client heartbeat calls this; a cron could too)
 *   pause / resume / kill / reset
 */
export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({ action: "tick" }))) as { action?: string };
  switch (action) {
    case "pause":
    case "resume":
    case "kill": {
      const state: WatcherState = action === "resume" ? "running" : action === "pause" ? "paused" : "killed";
      setWatcherState(state);
      return NextResponse.json(watcherStatus());
    }
    case "reset":
      watcherReset();
      return NextResponse.json(watcherStatus());
    default: {
      const { status, fired } = await tick();
      return NextResponse.json({ ...status, fired });
    }
  }
}
