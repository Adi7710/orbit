import SwiftUI

/// A button that makes Orbit say something, and shows the words while it does.
///
/// The caption is not decoration. Voice with no visible consequence is a
/// party trick: seeing the sentence is how a student checks that the number
/// they just heard is the number on the screen behind it.
struct SpeakButton: View {
    let line: OrbitVoice.Line
    var label: String = "Hear it"
    /// The caller may already be showing the sentence. The voice sheet does,
    /// so it turns this off rather than printing the same paragraph twice.
    var showsCaption: Bool = true

    // `@ObservedObject`, not `@StateObject`: this view does not own the
    // singleton, and `@StateObject` promises to create and keep it.
    @ObservedObject private var voice = OrbitVoice.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                if voice.isSpeaking { voice.stop() } else { Task { await voice.speak(line) } }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: voice.isSpeaking ? "stop.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text(voice.isSpeaking ? "Stop" : label)
                        .orbitEyebrow()
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 13)
                // Neutral, not lime. Two reasons. White on the acid lime is
                // about 1.4:1 and simply cannot be read, and lime is the
                // primary action of a surface -- on Today that is already
                // "Plan my day". A quiet capsule is also the honest weight for
                // this: it plays a sentence, it does not start a conversation.
                .background(Capsule().fill(Color.orbitSurface))
                .overlay(Capsule().strokeBorder(voice.isSpeaking ? Color.orbitUrgent.opacity(0.45) : Color.orbitHairline, lineWidth: 1))
                .foregroundStyle(voice.isSpeaking ? Color.orbitUrgent : Color.orbitInk)
            }
            .buttonStyle(.orbitTile)
            .accessibilityLabel(voice.isSpeaking ? "Stop speaking" : "Hear your day")

            if showsCaption, !voice.caption.isEmpty {
                Text(voice.caption)
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }

            if let err = voice.lastError {
                // Said plainly rather than swallowed: a student who taps a
                // button and gets silence assumes the app is broken, which it
                // may well be.
                Text(err)
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitUrgent)
            }
        }
        .animation(.easeOut(duration: 0.2), value: voice.caption)
        .animation(.easeOut(duration: 0.2), value: voice.isSpeaking)
    }
}
