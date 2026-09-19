import { NextResponse } from "next/server";
import { handleVoiceTool, type VoiceRequest } from "@/agents/voiceTools";

export const dynamic = "force-dynamic";

/**
 * The single webhook every ElevenLabs server tool points at. Configure four
 * tools in the agent dashboard, all POSTing here with a `tool` field:
 *
 *   get_today                                 -> the ledger, the best gap
 *   log_actual  { task, minutes }             -> completes it, awards XP
 *   set_mode    { mode }                      -> normal | crisis | chill
 *   get_bus     { destination? }              -> leave-by, live status, verdict
 *
 * Header `x-orbit-secret` must equal VOICE_TOOL_SECRET. The response is always
 * `{ text }`, a finished sentence the agent reads aloud; it never returns raw
 * numbers for the model to phrase, so it cannot invent one.
 */
export async function POST(req: Request) {
  const secret = process.env.VOICE_TOOL_SECRET;
  if (secret && req.headers.get("x-orbit-secret") !== secret) {
    return NextResponse.json({ text: "I am not allowed to reach your schedule." }, { status: 401 });
  }
  // The tool name lives in the URL, not the body. Each registered tool has its
  // own fixed URL and supplies only arguments, so the model cannot pick the
  // wrong tool by mis-filling a field.
  const tool = new URL(req.url).searchParams.get("tool");
  const body = (await req.json().catch(() => ({}))) as VoiceRequest;
  try {
    const r = await handleVoiceTool({ ...body, tool: tool ?? body.tool });
    return NextResponse.json({ text: r.text, ok: r.ok, ...(r.data ? { data: r.data } : {}) });
  } catch (e) {
    return NextResponse.json({ text: "I cannot reach your schedule right now.", ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** Lets a human sanity-check a tool from a browser: /api/voice/tool?tool=get_today */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const tool = u.searchParams.get("tool") ?? "get_today";
  const r = await handleVoiceTool({
    tool,
    task: u.searchParams.get("task") ?? undefined,
    minutes: u.searchParams.get("minutes") ? Number(u.searchParams.get("minutes")) : undefined,
    mode: u.searchParams.get("mode") ?? undefined,
    destination: u.searchParams.get("destination") ?? undefined,
  });
  return NextResponse.json(r);
}
