import Foundation

/// The voice screen's half of the API: one endpoint.
///
/// The app never talks to ElevenLabs to get credentials — the token is minted
/// by the server, which is the only place the API key exists.
extension OrbitAPI {

    func voiceToken() async throws -> VoiceToken {
        let data = try await send(path: "api/voice/token", method: "GET", body: Optional<NoVoiceBody>.none)
        return try decoder.decode(VoiceToken.self, from: data)
    }

    /// Stands in for "this request has no body"; `Never` is not `Encodable`.
    private struct NoVoiceBody: Encodable {}
}
