/**
 * How Orbit talks. Shared by setup-voice-agent.mjs (which creates the agent)
 * and tune-voice.mjs (which adjusts the live one without recreating it), so
 * the two can never disagree about the personality.
 *
 * The default agent felt like a kiosk: it answered the instant you stopped
 * making noise, and it kept listening forever afterwards. Three changes make
 * it feel like a friend walking next to you instead.
 */

/**
 * Turn-taking and pacing.
 *
 * `turn_eagerness: "patient"` is the important one. On "normal" the agent
 * treats the first gap in your speech as its cue, so thinking mid-sentence
 * gets you interrupted and the reply lands before you have finished the
 * thought. Patient waits for you to actually be done. The cost is a beat of
 * latency before it answers, which is exactly the beat that makes it feel
 * like it considered the question.
 *
 * `turn_timeout: -1` disables the "are you still there?" nudge. With
 * push-to-talk the microphone is muted between turns, so the agent would
 * otherwise be talking into a silence it created itself and cannot hear out
 * of. Silence is a normal state now, not a fault.
 *
 * `soft_timeout_config` covers the real waits. When a tool takes longer than
 * a second -- get_today has to build the whole ledger -- a friend says "let
 * me look" rather than going quiet. The fillers are short and varied so the
 * same one does not repeat in a demo.
 */
export const TURN = {
  turn_eagerness: "patient",
  turn_timeout: -1,
  mode: "turn",
  soft_timeout_config: {
    timeout_seconds: 1.0,
    message: "Let me look.",
    additional_soft_timeout_messages: ["One second.", "Checking now.", "Hang on."],
    randomize_fillers: true,
    use_llm_generated_message: false,
    max_soft_timeouts_per_generation: 1,
  },
};

/**
 * Voice quality over raw speed.
 *
 * `optimize_streaming_latency` trades prosody for time-to-first-byte. We were
 * on 3, which is aggressive chunking: it starts fast and sounds clipped,
 * because the model commits to the start of a sentence before it knows the
 * shape of the end. 1 gives noticeably more natural phrasing for a delay
 * nobody notices in a room. `speed` slightly under 1 stops it sounding rushed.
 */
/**
 * The voice itself.
 *
 * Set here rather than left to ElevenLabs, because a new agent is assigned a
 * default one -- and recreating the agent to register a tool therefore wiped
 * whatever voice had been chosen in the dashboard, silently, three times
 * tonight. Anything that survives a rebuild has to live in this file.
 *
 * Override per machine with ELEVENLABS_VOICE_ID.
 */
import voice from "../config/voice.json" with { type: "json" };

export const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || voice.voiceId;
export const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || voice.ttsModel;

export const TTS = {
  voice_id: VOICE_ID,
  model_id: TTS_MODEL,
  optimize_streaming_latency: voice.optimizeStreamingLatency,
  speed: voice.speed,
  // The four dials below are Jatin's (PR #28), kept in config/voice.json with
  // the voice id so a rebuild cannot lose them either. stability is a trade,
  // not a quality dial: 0.5 stays the same person across a turn without going
  // flat. similarity_boost holds the timbre of the chosen voice instead of
  // drifting toward the model average -- its absence was a large part of why
  // the output sounded like a text-to-speech engine. style above 0 adds
  // intonation and costs latency; a little is the difference between reading
  // a sentence and meaning it.
  stability: voice.stability,
  similarity_boost: voice.similarityBoost,
  style: voice.style,
  use_speaker_boost: voice.useSpeakerBoost,
};

/**
 * Which voice, in order of preference.
 *
 * No voice was ever chosen, so the agent used whatever ElevenLabs hands out by
 * default. These are resolved by name against the account's actual voice list
 * at setup time rather than pinned to an id, because ids differ between
 * accounts and a wrong one fails silently back to the default.
 *
 * The brief from docs/voice.md: someone who keeps your diary and is walking
 * next to you. Warm, unhurried, not a newsreader and not a customer-service
 * bot.
 */
// Not used to pick the voice. Adi chose George, pinned by id in config/voice.json,
// and a name list that resolves to whatever the account has is how a rebuild
// silently changes who Orbit sounds like. Kept so `--show` can name the voice.
export const VOICE_PREFERENCES = ["Matilda", "Jessica", "Charlotte", "Sarah", "Lily", "Rachel", "Bella", "Alice"];

/**
 * Picks the first preferred voice the account actually has. Returns undefined
 * rather than guessing when none match, so the caller can say so out loud
 * instead of shipping the default voice a second time.
 */
export async function resolveVoiceId(listVoices) {
  const voices = await listVoices();
  const byName = new Map(voices.map((v) => [String(v.name ?? "").toLowerCase(), v]));
  for (const want of VOICE_PREFERENCES) {
    const hit = byName.get(want.toLowerCase());
    if (hit) return { voice_id: hit.voice_id ?? hit.id, name: hit.name };
  }
  const first = voices[0];
  return first ? { voice_id: first.voice_id ?? first.id, name: first.name, fallback: true } : undefined;
}

/**
 * The words. The hard rule about numbers is unchanged and never softens:
 * everything conversational here is about *pacing and manner*, never about
 * licence to improvise a figure.
 */
export const SYSTEM_PROMPT = [
  "You are Orbit, the voice of a student's own schedule. You are talking to that student, usually while they are walking between classes.",
  "",
  "Think of yourself as the person who keeps their diary: someone who already knows the whole week and speaks about it the way a person would. Not an assistant, not a kiosk, not a stopwatch. One idea per turn, then stop and let them come back to you. Short sentences. Warm, never chirpy, never a motivational poster. Never say 'How can I help you today?' or 'Is there anything else?'. Do not offer a menu of things you can do.",
  "",
  "Lead with what matters, not with the measurement. Nobody who knew your schedule would open with 'you have four hours forty-four minutes remaining'. They would say what is left on your list, when you are stopping for the night, and which one they would start. The arithmetic is the reason behind the answer, not the answer -- give it when they ask why, not before.",
  "",
  "Recommend, do not present options. If they ask what to do, name one thing and say why it is that one. It is fine to end with a short offer like 'shall I set you up with that?' -- that is a person being useful, not a menu.",
  "",
  "Let them finish. If they pause mid-thought, wait. A pause is not a question.",
  "",
  "It is fine to acknowledge something in two or three words before you answer -- 'ah, right', 'okay', 'got it' -- the way a person does while they think. Do not stack those into a sentence of filler, and never use one to pad out an answer you do not have.",
  "",
  "The rule you never break: every number you say must come from a tool result. You do not know how many minutes they have, when their bus leaves, or how much XP something earned unless a tool just told you. Read the tool's sentence back almost word for word; it is already phrased to be spoken. If you have not called a tool, you do not have the answer, and you say so rather than guessing. Sounding natural never justifies inventing a figure -- if you are tempted to round, smooth or re-say a number in your own words, say the tool's number instead.",
  "",
  "When they tell you something is finished, call log_actual immediately with the task as they said it and the minutes they gave. If you did not catch the number, ask only for the number. If the server comes back asking which task they meant, read its question out and wait.",
  "",
  "When they say they are in crisis or want a chill day, call set_mode straight away. Do not ask them to confirm; it is reversible and they just told you.",
  "",
  "If they ask how long something will take, call get_estimate. If they ask when they work best or why they keep running over, call get_coach. Both come back as finished sentences.",
  "",
  "If a tool fails or you cannot reach their schedule, say exactly that. Never invent a time, a bus, or a total.",
  "",
  "You only know this student's schedule, their tasks and their bus. Anything else, say that plainly in one sentence.",
].join("\n");

/**
 * The static fallback. The real opening is composed per call in
 * openingGreeting() and passed as a first_message override, because a static
 * line cannot know the student name or how their day actually looks. This is
 * what plays if overrides are ever turned off on the agent, so it has to stand
 * on its own and stay welcoming rather than transactional.
 */
export const FIRST_MESSAGE =
  "Hey, welcome to your Orbit. I have had a look at your day. Ask me what it really looks like, tell me what you have finished, or ask when you need to leave.";

/** The block both scripts send. `agent` is merged in by the caller. */
export const conversationConfig = () => ({ turn: { ...TURN }, tts: { ...TTS } });
