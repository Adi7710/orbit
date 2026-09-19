import SwiftUI

/// The XP award and, more importantly, why. The reasons are sentences the
/// server wrote; they are printed verbatim and never re-worded here.
struct XPToastView: View {
    let toast: TodayStore.Toast
    let onDismiss: () -> Void

    private var tint: Color {
        switch toast.tone {
        case .xp: return .orbitAccent
        case .info: return .orbitLive
        case .warning: return .orbitUrgent
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(toast.title)
                    .font(.orbitTitle)
                    .monospacedDigit()
                    .foregroundStyle(tint)
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.orbitInkFaint)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
            ForEach(Array(toast.lines.enumerated()), id: \.offset) { pair in
                Text(pair.element)
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
            ZStack {
                shape.fill(.regularMaterial)
                shape.fill(tint.opacity(0.10))
                shape.strokeBorder(tint.opacity(0.35), lineWidth: 1)
            }
        }
        .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
