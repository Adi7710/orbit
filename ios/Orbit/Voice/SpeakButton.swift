import SwiftUI

/// A button that makes Orbit say something, and shows the words while it does.
///
/// The caption is not decoration. Voice with no visible consequence is a
/// party trick: seeing the sentence is how a student checks that the number
/// they just heard is the number on the screen behind it.
struct SpeakButton: View {
    let line: OrbitVoice.Line
    var label: String = "Hear it"

    @StateObject private var voice = OrbitVoice.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                if voice.isSpeaking { voice.stop() } else { Task { await voice.speak(line) } }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: voice.isSpeaking ? "stop.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text(voice.isSpeaking ? "Stop" : label)
                        .font(.system(size: 15, weight: .medium))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Capsule().fill(voice.isSpeaking ? Color.red : Color.orbitAccent))
                .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(voice.isSpeaking ? "Stop speaking" : "Hear your day")

            if !voice.caption.isEmpty {
                Text(voice.caption)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }

            if let err = voice.lastError {
                // Said plainly rather than swallowed: a student who taps a
                // button and gets silence assumes the app is broken, which it
                // may well be.
                Text(err)
                    .font(.system(size: 13))
                    .foregroundStyle(.red)
            }
        }
        .animation(.easeOut(duration: 0.2), value: voice.caption)
        .animation(.easeOut(duration: 0.2), value: voice.isSpeaking)
    }
}
