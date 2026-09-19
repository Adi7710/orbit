import SwiftUI

/// A ring that fills to a fraction the server computed.
///
/// Draws two `Circle` strokes and nothing else: no `Canvas`, no `TimelineView`,
/// no per-frame closure. A trimmed stroke is a GPU-side path change, which is
/// what lets several of these ride along in a scrolling deck at 120Hz.
struct CircularProgressRing<Label: View>: View {
    /// 0...1, already clamped by the caller's data, not recomputed here.
    let progress: Double
    var tint: Color = .orbitAccent
    var lineWidth: CGFloat = 8
    var trackOpacity: Double = 0.16
    @ViewBuilder var label: () -> Label

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(trackOpacity), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(
                    AngularGradient(
                        colors: [tint.opacity(0.55), tint, tint.opacity(0.85)],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .smooth(duration: 0.6), value: progress)

            label()
        }
        .accessibilityElement(children: .combine)
    }
}

extension CircularProgressRing where Label == EmptyView {
    init(progress: Double, tint: Color = .orbitAccent, lineWidth: CGFloat = 8) {
        self.init(progress: progress, tint: tint, lineWidth: lineWidth, label: { EmptyView() })
    }
}
