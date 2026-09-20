import voice from "../../config/voice.json";

/**
 * Orbit's voice, for the server.
 *
 * The same config/voice.json that scripts/voice-config.mjs uses to set up the
 * ElevenLabs agent, so the agent you talk to and the audio the iOS app plays
 * are the same person. Keeping two copies is exactly how the voice reset
 * itself to a default three times in one evening.
 *
 * ELEVENLABS_VOICE_ID overrides it per machine.
 */
export const VOICE = {
  voiceId: process.env.ELEVENLABS_VOICE_ID || voice.voiceId,
  voiceName: voice.voiceName,
  ttsModel: voice.ttsModel,
  stability: voice.stability,
  similarityBoost: voice.similarityBoost,
  speed: voice.speed,
} as const;
