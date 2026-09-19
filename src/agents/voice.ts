/**
 * ElevenLabs Agents integration. The browser opens a WebRTC session with a
 * token minted here; the agent's server tools call back into /api/voice/tool.
 * Voice does three things: morning briefing, evening check-in (actual minutes
 * feed the estimator), and mode switching ("I'm in crisis mode").
 */
export async function mintConversationToken(): Promise<string> {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${process.env.ELEVENLABS_AGENT_ID}`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
  });
  if (!r.ok) throw new Error(`elevenlabs token ${r.status}`);
  const { token } = await r.json();
  return token as string;
}

/** Text the agent speaks first, built from the real ledger so it is never generic. */
export function morningBriefing(usable: number, naiveFree: number, gaps: { start: string; end: string; usable: number }[], firstQuest?: string): string {
  const h = Math.floor(usable / 60), m = usable % 60;
  const lost = naiveFree - usable;
  const gapText = gaps.length ? `Your best window is ${gaps[0].start} to ${gaps[0].end}, ${gaps[0].usable} minutes.` : "No usable gaps today, so tonight is the plan.";
  return `Morning. Your calendar thinks you have ${Math.floor(naiveFree / 60)} free hours. You actually have ${h} hours ${m}. The missing ${lost} minutes are walking, eating and getting settled. ${gapText} ${firstQuest ? `First quest: ${firstQuest}.` : ""} Say crisis if today is a crisis.`;
}
