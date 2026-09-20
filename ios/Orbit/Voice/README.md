# Voice on iOS

> Orbit speaks in **George**, the same ElevenLabs voice as the web agent. Not `AVSpeechSynthesizer`, which is where "robotic" came from.

## Adding it to the Xcode project

Two files, no dependencies, no SPM package:

1. Drag `OrbitVoice.swift` and `SpeakButton.swift` into the Orbit target.
2. Use it anywhere:

```swift
SpeakButton(line: .greeting, label: "Hear your day")
```

There is **nothing to add to Info.plist.** This plays audio; it does not record, so no `NSMicrophoneUsageDescription` and no permission prompt.

## How it works, and why this way

```
iOS  ──GET /api/voice/speak?say=greeting──▶  Orbit server
                                              ├─ composes the sentence (same
                                              │  tools the web agent calls)
                                              └─ renders it via ElevenLabs
     ◀────────── audio/mpeg + X-Orbit-Text ───   using config/voice.json
```

Two properties matter more than the convenience:

- **The app never holds the API key.** It asks for a sentence and gets an MP3. Nothing secret ships in the bundle, so nothing can be pulled out of it.
- **The app never chooses the words.** `Line` names *what* to say — `.greeting`, `.today`, `.bus`, `.coach` — never the text. The endpoint does not accept arbitrary text at all, so a client cannot make Orbit read out a number the server did not compute. Same rule the voice agent follows.

`X-Orbit-Text` carries the words alongside the audio, so the caption costs no second round trip. Show it: voice with no visible consequence is a party trick, and seeing the sentence is how a student checks the number they heard is the number on screen.

## What this is not

This is **playback, not conversation.** You can hear Orbit; you cannot talk back. Full duplex needs the ElevenLabs Swift SDK, a WebRTC session and microphone permission, and that is a real piece of work — the web app has it, iOS does not.

Deliberate, for two reasons. It removes the robotic voice today with code that has no SDK surface to get wrong, and it keeps the key server-side. When the conversational version is built, `/api/voice/token` already mints the session token the SDK needs.

## If it fails

| Symptom | Cause |
|---|---|
| "Voice is not configured on the server." | No `ELEVENLABS_API_KEY` on the machine serving `ORBIT_API_BASE`. |
| Nothing plays, no error | Check `ORBIT_API_BASE` in Info.plist actually reaches the server. |
| Still robotic | Something in the project is still calling `AVSpeechSynthesizer` — that code is not in this repo, so search the Xcode project for it and delete it. |

It never falls back to the system synthesiser. A robotic voice reading a real number is worse than silence with an explanation, because it teaches the student that is what Orbit sounds like.
