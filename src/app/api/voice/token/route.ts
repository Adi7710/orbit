import { NextResponse } from "next/server";
import { mintConversationToken, morningBriefing } from "@/agents/voice";
import { buildToday } from "@/lib/today";

export const dynamic = "force-dynamic";

/** Mints a WebRTC token for the ElevenLabs agent and returns the briefing text built from the real ledger. */
export async function GET() {
  const today = await buildToday();
  const briefing = morningBriefing(today.ledger.usable, today.ledger.naiveFree, today.gaps.map((g) => ({ start: g.startText, end: g.endText, usable: g.usable })), today.quests[0]?.title);
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID) {
    return NextResponse.json({ token: null, briefing, reason: "no ELEVENLABS keys; text briefing only" });
  }
  try {
    return NextResponse.json({ token: await mintConversationToken(), briefing });
  } catch (e) {
    return NextResponse.json({ token: null, briefing, reason: (e as Error).message });
  }
}
