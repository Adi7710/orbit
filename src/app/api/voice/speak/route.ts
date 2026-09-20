import { NextResponse } from "next/server";
import { VOICE } from "@/agents/voiceConfig";
import { openingGreeting, handleVoiceTool } from "@/agents/voiceTools";

export const dynamic = "force-dynamic";

/**
 * Orbit's voice, as audio, for clients that cannot host a conversation.
 *
 * The iOS app has no ElevenLabs integration and no app entry point in this
 * repo, so whatever spoke in Xcode was Apple's own synthesiser -- which is
 * where "robotic" comes from. Rather than ship untested SDK glue for a
 * full duplex WebRTC session, this returns finished speech: the server picks
 * the sentence, renders it in the same voice the web agent uses, and the app
 * just plays an MP3.
 *
 * The rule the whole voice design rests on is unchanged and in fact stronger
 * here. The text is composed server-side by the same tools the agent calls, so
 * a client cannot ask Orbit to say an invented number -- `text` is not even
 * accepted as a parameter.
 *
 *   GET /api/voice/speak?say=greeting      the opening line
 *   GET /api/voice/speak?say=today         the day, spoken
 *   GET /api/voice/speak?say=bus           when to leave
 *
 * The key never leaves the server; the client receives audio.
 */
const SAYABLE = ["greeting", "today", "bus", "coach"] as const;
type Sayable = (typeof SAYABLE)[number];

async function sentenceFor(say: Sayable): Promise<string> {
  if (say === "greeting") return openingGreeting();
  const tool = say === "today" ? "get_today" : say === "bus" ? "get_bus" : "get_coach";
  const r = await handleVoiceTool({ tool });
  return r.text;
}

export async function GET(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "voice is not configured on this server" }, { status: 503 });

  const askedFor = new URL(req.url).searchParams.get("say") ?? "greeting";
  if (!SAYABLE.includes(askedFor as Sayable)) {
    return NextResponse.json({ error: `say must be one of ${SAYABLE.join(", ")}` }, { status: 400 });
  }

  const text = await sentenceFor(askedFor as Sayable);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.voiceId}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: VOICE.ttsModel,
      voice_settings: { stability: VOICE.stability, similarity_boost: VOICE.similarityBoost, speed: VOICE.speed },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `elevenlabs ${res.status}`, detail: (await res.text()).slice(0, 200) }, { status: 502 });
  }

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      // The sentence changes with the day, so this is short-lived. Private:
      // it is one student's schedule read aloud, never a shared CDN object.
      "Cache-Control": "private, max-age=15",
      // So a client can show the words it is playing without a second call.
      "X-Orbit-Text": encodeURIComponent(text),
    },
  });
}
