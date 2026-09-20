import Foundation
import AVFoundation

/// Orbit speaking, in Orbit's voice.
///
/// The app was using the system synthesiser, which is where "robotic" comes
/// from: `AVSpeechSynthesizer` is a text-to-speech engine from another era and
/// it sounds like one. This plays audio rendered by the server in the same
/// ElevenLabs voice the web agent uses, so the app and the browser sound like
/// the same person.
///
/// Two things it deliberately does not do:
///
/// - **It does not hold the API key.** The key stays on the server; the app
///   asks for a sentence and receives an MP3. Nothing secret ships in the
///   bundle, and nothing can be extracted from it.
/// - **It does not choose the words.** `Line` names *what* to say, never the
///   text itself, so the app cannot ask Orbit to read out a number the server
///   did not compute. That is the same rule the voice agent follows.
@MainActor
final class OrbitVoice: NSObject, ObservableObject {
    static let shared = OrbitVoice()

    /// What Orbit can be asked to say. The server writes the sentence.
    enum Line: String {
        case greeting   // "Evening, Adi. You have the rest of tonight…"
        case today      // the day, and what to start
        case bus        // when to leave
        case coach      // what your own history says
    }

    @Published private(set) var isSpeaking = false
    /// The words currently being spoken, so a view can show them as they play.
    @Published private(set) var caption = ""
    @Published private(set) var lastError: String?

    private var player: AVAudioPlayer?

    /// Fetch and play. Safe to call again while speaking: the new line wins.
    func speak(_ line: Line) async {
        stop()
        lastError = nil
        do {
            let (data, text) = try await fetchSpeech(line)
            try configureSession()
            let p = try AVAudioPlayer(data: data)
            p.delegate = self
            player = p
            caption = text
            isSpeaking = true
            p.play()
        } catch {
            // Never fall back to the system synthesiser. A robotic voice
            // reading a real number is worse than silence with an explanation,
            // because it teaches the student this is what Orbit sounds like.
            isSpeaking = false
            caption = ""
            lastError = (error as NSError).localizedDescription
        }
    }

    func stop() {
        player?.stop()
        player = nil
        isSpeaking = false
    }

    // MARK: - Private

    private func fetchSpeech(_ line: Line) async throws -> (Data, String) {
        var c = URLComponents(url: OrbitAPI.shared.base.appendingPathComponent("api/voice/speak"),
                              resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "say", value: line.rawValue)]
        var req = URLRequest(url: c.url!)
        req.timeoutInterval = 25
        req.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard http.statusCode == 200 else {
            // 503 means the server has no ElevenLabs key, which is a
            // configuration problem worth naming rather than a network blip.
            throw NSError(domain: "OrbitVoice", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: http.statusCode == 503
                    ? "Voice is not configured on the server."
                    : "Could not load speech (\(http.statusCode))."
            ])
        }
        // The server sends the words alongside the audio so the caption does
        // not cost a second round trip.
        let text = (http.value(forHTTPHeaderField: "X-Orbit-Text") ?? "").removingPercentEncoding ?? ""
        return (data, text)
    }

    /// Play through the speaker, and duck rather than silence other audio.
    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        // .playback so it is audible with the ringer switch off -- a student
        // walking to class has their phone on silent, and a briefing nobody
        // hears is the same as no briefing.
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: [])
    }
}

extension OrbitVoice: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isSpeaking = false
            self.caption = ""
            // Hand the audio session back so other apps resume at full volume.
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        }
    }
}
