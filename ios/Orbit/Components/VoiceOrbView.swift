import SwiftUI

/// The hold-to-talk button, and the only thing on the voice sheet that is lime.
///
/// It is one element doing two jobs on purpose. The accent budget allows lime
/// on the one primary action of a surface, and while this sheet is up the dock
/// — which owns the lime on Today — is behind it. So "the thing you press" and
/// "the thing that shows it is hearing you" have to be the same object, or the
/// sheet spends the accent twice.
///
/// Everything that moves here is composited: `scaleEffect` and `opacity`, never
/// a frame. The rings are two circles that already exist and change size by
/// transform, so a voice level arriving forty times a second never runs layout.
struct VoiceOrbView: View {
    /// The finger is down and the microphone is open.
    let isOpen: Bool
    let turn: VoiceSession.Turn
    /// 0...1, already smoothed by the session.
    let level: Double
    var enabled: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var diameter: CGFloat { 96 }

    /// How far the halo pushes out on the current syllable. Under Reduce
    /// Motion it does not: the orb still fills lime, so "it is hearing you" is
    /// carried by colour alone, which is the one channel that never moves.
    private var halos: Double { isOpen && !reduceMotion ? 1 : 0 }

    private var swell: CGFloat {
        guard isOpen, !reduceMotion else { return 1 }
        return 1 + CGFloat(level) * 0.22
    }

    var body: some View {
        ZStack {
            // Always in the tree, hidden by opacity rather than by an `if`.
            // Inserting them on touch-down changes the structural identity of
            // this subtree, and SwiftUI cancels the in-flight gesture when that
            // happens — which showed up as the microphone never closing on
            // release. Opacity and scale are also the two things the compositor
            // can do without a layout pass.
            Circle()
                .fill(Color.orbitAccent.opacity(0.16))
                .frame(width: diameter, height: diameter)
                .scaleEffect(swell * 1.34)
                .opacity(halos)
            Circle()
                .fill(Color.orbitAccent.opacity(0.22))
                .frame(width: diameter, height: diameter)
                .scaleEffect(swell * 1.16)
                .opacity(halos)

            Circle()
                .fill(isOpen ? AnyShapeStyle(LinearGradient.orbitAccent) : AnyShapeStyle(Color.orbitSurface))
                .frame(width: diameter, height: diameter)
                .overlay(
                    Circle().strokeBorder(isOpen ? Color.clear : Color.orbitHairline, lineWidth: 1)
                )
                .scaleEffect(isOpen ? swell : 1)

            Image(systemName: glyph)
                .font(.system(size: 30, weight: .medium))
                .foregroundStyle(isOpen ? Color.orbitOnAccent : Color.orbitInk)
                .opacity(enabled ? 1 : 0.35)
        }
        .frame(width: diameter * 1.42, height: diameter * 1.42)
        .orbitBloom(.orbitAccent, active: isOpen, radius: 26)
        .animation(OrbitMotion.snap(reduceMotion), value: isOpen)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: level)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isOpen ? "Listening. Release to send." : "Hold to talk")
        .accessibilityAddTraits(.isButton)
    }

    private var glyph: String {
        if isOpen { return "waveform" }
        return turn == .speaking ? "speaker.wave.2.fill" : "mic.fill"
    }
}
