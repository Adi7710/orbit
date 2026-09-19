import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";
import { buildToday } from "@/lib/today";

export const dynamic = "force-dynamic";

/**
 * Server tool endpoint for the ElevenLabs agent. Configure three tools in the
 * agent dashboard pointing here with a `tool` field:
 *  - get_today      -> ledger, gaps, quests as text
 *  - set_mode       -> { mode }
 *  - log_actual     -> { taskId, actualMinutes }  (feeds the estimator via /api/complete)
 */
export async function POST(req: Request) {
  if (process.env.VOICE_TOOL_SECRET && req.headers.get("x-orbit-secret") !== process.env.VOICE_TOOL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { tool: string; mode?: "normal" | "crisis" | "chill"; taskId?: string; actualMinutes?: number };
  const s = store();
  switch (body.tool) {
    case "get_today": {
      const t = await buildToday();
      return NextResponse.json({ text: `Usable ${t.ledger.usable} minutes, calendar claims ${t.ledger.naiveFree}. Gaps: ${t.gaps.map((g) => `${g.startText} to ${g.endText}${g.pick ? ` for ${g.pick.title}` : ""}`).join("; ")}. Bus: leave by ${t.bus?.leaveByText ?? "n/a"}.` });
    }
    case "set_mode": {
      if (body.mode) { s.mode = body.mode; log("voice", "mode_changed", { mode: body.mode }); }
      return NextResponse.json({ text: `Mode set to ${s.mode}.` });
    }
    case "log_actual": {
      const r = await fetch(new URL("/api/complete", req.url), { method: "POST", body: JSON.stringify({ taskId: body.taskId, actualMinutes: body.actualMinutes }), headers: { "Content-Type": "application/json" } });
      const j = await r.json();
      return NextResponse.json({ text: j.ok ? `Logged. ${j.xp} XP. Your estimate multiplier is now ${Number(j.multiplier).toFixed(2)}.` : "Could not log that." });
    }
    default:
      return NextResponse.json({ text: "Unknown tool." }, { status: 400 });
  }
}
