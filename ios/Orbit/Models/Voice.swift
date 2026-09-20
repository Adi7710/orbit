import Foundation

/// Mirrors `GET /api/voice/token` (`src/app/api/voice/token/route.ts`).
///
/// `token` is nil whenever voice cannot run — no ElevenLabs keys, minutes
/// exhausted, the mint failing — and `reason` says which one. That is not a
/// path to hide. `briefing` is always there and is the same sentence the agent
/// would have spoken, composed on the server from the real ledger, so the
/// feature degrades to text you can still read rather than a button that does
/// nothing.
struct VoiceToken: Decodable {
    /// WebRTC conversation token. Nil means voice is off; `reason` says why.
    let token: String?
    /// The honest accounting. Always present.
    let briefing: String
    /// The one warm line the agent opens with, composed per call so it can use
    /// the student's name and a real number. Sent as `firstMessage`, which
    /// overrides the agent's static opening.
    let greeting: String?
    let reason: String?

    var isAvailable: Bool { token != nil }
}
