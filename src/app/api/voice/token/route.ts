import { NextResponse } from "next/server";
import { mintConversationToken } from "@/agents/voice";
import { openingBriefing, openingGreeting } from "@/agents/voiceTools";

export const dynamic = "force-dynamic";

/** Mints a WebRTC token for the ElevenLabs agent and returns the briefing text built from the real ledger. */
export async function GET() {
  const briefing = await openingBriefing();
  // What the agent actually says first. Composed here so the spoken opening
  // carries the student name and a real number without the model inventing one.
  const greeting = await openingGreeting();
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID) {
    return NextResponse.json({ token: null, briefing, greeting, reason: "no ELEVENLABS keys; text briefing only" });
  }
  try {
    return NextResponse.json({ token: await mintConversationToken(), briefing, greeting });
  } catch (e) {
    return NextResponse.json({ token: null, briefing, greeting, reason: (e as Error).message });
  }
}
