import AVFoundation
import Foundation
import Observation
import ElevenLabs

/// The voice call, as state the screen can draw.
///
/// The rules this is built to, from `docs/voice.md`:
///
/// - **Push to talk.** The session stays connected — that is what keeps replies
///   fast and lets you cut in — but the microphone is muted between turns and
///   only opens while a finger is down. Silence is the resting state, so Orbit
///   never answers the next table.
/// - **The server writes the sentence.** Every line in the transcript arrived
///   from the agent or from Scribe. Nothing here composes a number, and there
///   is no branch that would let it.
/// - **Voice with no visible consequence is a chatbot.** `onAgentActed` fires
///   after each agent turn so Today reloads behind the sheet while the agent is
///   still speaking.
/// - **Degrade visibly.** No token is a state with a reason and a briefing you
///   can read or have read to you, never a dead button.
///
/// `@Observable` for the reason in `PERFORMANCE.md`: the VAD level updates many
/// times a second and only the orb reads it, so only the orb redraws. With
/// `ObservableObject` every tick would rebuild the transcript too.
@Observable
@MainActor
final class VoiceSession {

    enum Phase: Equatable {
        case idle
        case connecting
        case live
        /// Voice cannot run. The string is the server's own reason, shown as-is.
        case unavailable(String)

        var isLive: Bool { self == .live }
    }

    /// What the agent is doing. Reported by the SDK, never inferred from
    /// timing — a guessed "thinking" that is wrong is worse than none.
    enum Turn: Equatable { case listening, thinking, speaking }

    struct Line: Identifiable, Equatable {
        let id: String
        let role: Role
        let text: String
        enum Role { case you, orbit }
    }

    private(set) var phase: Phase = .idle
    private(set) var lines: [Line] = []
    private(set) var briefing = ""
    private(set) var turn: Turn = .listening
    private(set) var micOpen = false
    private(set) var isReading = false
    /// Non-fatal trouble, worded by whoever produced it.
    private(set) var note: String?
    /// 0...1, smoothed. Read by the orb and by nothing else.
    private(set) var level: Double = 0

    /// Open mic. Off by default and deliberately awkward to leave on: it is
    /// for the demo, where holding a button while pointing at the screen is
    /// not possible.
    var handsFree = false {
        didSet { if phase.isLive { setMic(open: handsFree) } }
    }

    /// Fired after the agent has spoken, so the day behind the sheet catches up.
    var onAgentActed: (() -> Void)?

    // None of these are state a view reads, so they stay out of observation.
    // `lazy` is not an option here either: the macro rewrites a tracked
    // property into a computed one, and `lazy` cannot be applied to that.
    @ObservationIgnored private var conversation: Conversation?
    @ObservationIgnored private let speech = AVSpeechSynthesizer()
    @ObservationIgnored private let speechWatcher = SpeechWatcher()

    init() {
        speech.delegate = speechWatcher
        speechWatcher.onStop = { [weak self] in self?.isReading = false }
    }

    // MARK: - Opening

    /// Fetches the briefing before anyone presses anything, so the sheet has
    /// something true on it the moment it opens. Cheap, and it means the
    /// "voice is off" state is known before the button is offered.
    func prepare() async {
        #if DEBUG
        if Self.isUIPreview { loadPreviewState(); return }
        #endif
        guard briefing.isEmpty else { return }
        do {
            let response = try await OrbitAPI.shared.voiceToken()
            briefing = response.briefing
            if !response.isAvailable {
                phase = .unavailable(response.reason ?? "voice is not configured")
            }
        } catch {
            phase = .unavailable("Orbit can't reach the server")
        }
    }

    // MARK: - The call

    func connect() async {
        guard phase == .idle else { return }
        phase = .connecting
        lines = []
        note = nil

        do {
            let response = try await OrbitAPI.shared.voiceToken()
            briefing = response.briefing

            guard let token = response.token else {
                phase = .unavailable(response.reason ?? "voice is not configured")
                return
            }
            guard await Self.microphoneGranted() else {
                phase = .unavailable("microphone permission denied")
                return
            }
            try configureAudioSession()

            var config = ConversationConfig()
            // The agent's own first message is static and cannot know a name or
            // a number. This is the line the server composed for this call.
            if let greeting = response.greeting, !greeting.isEmpty {
                config.agentOverrides = AgentOverrides(firstMessage: greeting)
            }
            config.onUserTranscript = { [weak self] text, eventId in
                Task { @MainActor in self?.append(.you, text, id: "u\(eventId)") }
            }
            config.onAgentResponse = { [weak self] text, eventId in
                Task { @MainActor in
                    self?.append(.orbit, text, id: "a\(eventId)")
                    // Whatever it just did landed on the server. Let the screen
                    // behind catch up while it is still talking.
                    self?.onAgentActed?()
                }
            }
            config.onAgentStateChange = { [weak self] state in
                Task { @MainActor in
                    switch state {
                    case .listening: self?.turn = .listening
                    case .thinking:  self?.turn = .thinking
                    case .speaking:  self?.turn = .speaking
                    }
                }
            }
            config.onVadScore = { [weak self] score in
                Task { @MainActor in self?.feedLevel(score) }
            }
            config.onError = { [weak self] error in
                Task { @MainActor in self?.note = error.errorDescription }
            }
            config.onDisconnect = { [weak self] _ in
                Task { @MainActor in self?.finish() }
            }

            let conversation = try await ElevenLabs.startConversation(conversationToken: token, config: config)
            self.conversation = conversation
            // Muted before anyone has said anything near it. `setMuted` is
            // buffered while connecting, so this lands even if we beat the
            // handshake.
            try? await conversation.setMuted(!handsFree)
            micOpen = handsFree
            phase = .live
        } catch {
            note = (error as? ConversationError)?.errorDescription ?? error.localizedDescription
            phase = .idle
            deactivateAudioSession()
        }
    }

    func hangUp() async {
        await conversation?.endConversation()
        finish()
    }

    /// The finger went down or came up. Everything about push-to-talk is here.
    func setMic(open: Bool) {
        guard phase.isLive, micOpen != open else { return }
        micOpen = open
        if !open { level = 0 }
        let wasSpeaking = turn == .speaking
        Task { [weak self] in
            guard let conversation = self?.conversation else { return }
            // Holding while it is talking is how you cut in. Tell it to stop
            // rather than talking over it.
            if open, wasSpeaking { try? await conversation.interruptAgent() }
            try? await conversation.setMuted(!open)
        }
    }

    /// Anything that takes the app away — a notification, the lock button,
    /// switching apps — closes the microphone. Without this a call that
    /// backgrounds mid-hold comes back still listening, which is the exact
    /// behaviour push-to-talk exists to remove.
    func closeMicForBackground() {
        handsFree = false
        setMic(open: false)
    }

    // MARK: - The fallback

    /// Reads the briefing aloud on the device. Not a substitute for the agent —
    /// it cannot answer anything — but it is the one thing voice was for that
    /// still works with no keys, no signal and no minutes left.
    func toggleReadBriefing() {
        guard !briefing.isEmpty else { return }
        if speech.isSpeaking {
            speech.stopSpeaking(at: .immediate)
            isReading = false
            return
        }
        try? configureAudioSession(forPlaybackOnly: true)
        let utterance = AVSpeechUtterance(string: briefing)
        // The same 0.95 the agent's TTS runs at. Default rate reads a ledger
        // like a disclaimer.
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        utterance.postUtteranceDelay = 0.2
        speech.speak(utterance)
        isReading = true
    }

    // MARK: - Internals

    private func append(_ role: Line.Role, _ text: String, id: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let last = lines.last, last.id == id {
            lines[lines.count - 1] = Line(id: id, role: role, text: trimmed)
        } else {
            lines.append(Line(id: id, role: role, text: trimmed))
        }
        // Same window the web keeps. A transcript is context, not a log.
        if lines.count > 8 { lines.removeFirst(lines.count - 8) }
    }

    /// Exponential smoothing, and only published when it moved enough to see.
    /// The raw score arrives tens of times a second; the orb is 96 points
    /// across, so most of those ticks are a redraw nobody can perceive.
    private func feedLevel(_ score: Double) {
        guard micOpen else { return }
        let next = level * 0.7 + min(max(score, 0), 1) * 0.3
        if abs(next - level) > 0.03 { level = next }
    }

    private func finish() {
        conversation = nil
        micOpen = false
        level = 0
        turn = .listening
        if phase != .idle, !isUnavailable { phase = .idle }
        deactivateAudioSession()
    }

    private var isUnavailable: Bool {
        if case .unavailable = phase { return true }
        return false
    }

    private func configureAudioSession(forPlaybackOnly: Bool = false) throws {
        let session = AVAudioSession.sharedInstance()
        if forPlaybackOnly {
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
        } else {
            // .voiceChat gives echo cancellation, which is what lets you hold
            // the phone away from your face and still be understood.
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
        }
        try session.setActive(true)
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    #if DEBUG
    /// Test-only, and inert without the launch argument that only the UI tests
    /// pass. A live call needs an ElevenLabs key, so on a machine without one
    /// there is otherwise no way to look at the listening state at all — and
    /// "it compiles" is not the same as "the orb turns lime when you hold it".
    /// The gesture, the state machine and every view below are the real ones;
    /// only the transport is missing.
    static var isUIPreview: Bool {
        ProcessInfo.processInfo.arguments.contains("-orbit-voice-preview")
    }

    private func loadPreviewState() {
        briefing = "Hey Adi. Your calendar thinks you have thirteen hours thirty-five free today. You actually have nine hours forty-nine."
        lines = [
            Line(id: "p1", role: .you, text: "I just finished the problem set, it took me ninety-five minutes"),
            Line(id: "p2", role: .orbit, text: "Ninety-five minutes, logged. A hundred forty-three XP for finishing it in a planned gap, on time. Your MATH 0220 estimates are now one point six times what you guess."),
            Line(id: "p3", role: .you, text: "when do I leave for class"),
        ]
        turn = .speaking
        phase = .live
    }
    #endif

    private static func microphoneGranted() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
    }
}

/// `AVSpeechSynthesizerDelegate` is an `NSObject` protocol and `VoiceSession`
/// is not one, so the callback lands here and is forwarded.
private final class SpeechWatcher: NSObject, AVSpeechSynthesizerDelegate {
    var onStop: (@MainActor () -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.onStop?() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.onStop?() }
    }
}
