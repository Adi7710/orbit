import SwiftUI

/// The XP award and, more importantly, why. The reasons are sentences the
/// server wrote; they are printed verbatim and never re-worded here.
///
/// This is one of the two places a material is allowed: it is a fixed overlay
/// that sits still for a few seconds and then leaves.
struct XPToastView: View {
    let toast: TodayStore.Toast
    let onDismiss: () -> Void

    private var tint: Color {
        switch toast.tone {
        case .xp, .info: return .orbitAccentInk
        case .warning: return .orbitUrgent
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(toast.title)
                    .font(.orbitTitle)
                    .orbitTightDisplay()
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .contentTransition(.numericText())
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.orbitInkFaint)
                        .padding(8)
                        .background(Circle().fill(Color.orbitSurfaceInset))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }

            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(toast.lines.enumerated()), id: \.offset) { pair in
                    Text(pair.element)
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                        .orbitAppear(pair.offset)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
            ZStack {
                shape.fill(.regularMaterial)
                shape.fill(Color.orbitSurface.opacity(0.55))
                shape.strokeBorder(Color.orbitHairline, lineWidth: 1)
            }
        }
        .orbitBloom(tint, active: toast.tone == .xp, radius: 22)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
