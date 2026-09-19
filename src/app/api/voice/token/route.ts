import { NextResponse } from "next/server";
import { mintConversationToken } from "@/agents/voice";
import { openingBriefing } from "@/agents/voiceTools";

export const dynamic = "force-dynamic";

/** Mints a WebRTC token for the ElevenLabs agent and returns the briefing text built from the real ledger. */
export async function GET() {
  const briefing = await openingBriefing();
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID) {
    return NextResponse.json({ token: null, briefing, reason: "no ELEVENLABS keys; text briefing only" });
  }
  try {
    return NextResponse.json({ token: await mintConversationToken(), briefing });
  } catch (e) {
    return NextResponse.json({ token: null, briefing, reason: (e as Error).message });
  }
}
