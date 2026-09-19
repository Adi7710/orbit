import SwiftUI

/// The small pill used for statuses, domains and course codes.
///
/// One rounded rect, one gradient stroke, one label. No material and no shadow:
/// there can be a dozen of these on screen and each blur pass would be paid a
/// dozen times.
struct GradientTagView: View {
    let text: String
    var tint: Color = .orbitAccent
    var systemImage: String?
    /// A filled pill reads as "this is happening"; an outlined one as a label.
    var filled: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .bold))
            }
            Text(text)
                .font(.orbitCaption)
        }
        .foregroundStyle(filled ? Color.white : tint)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background {
            let shape = Capsule(style: .continuous)
            if filled {
                shape.fill(
                    LinearGradient(colors: [tint, tint.opacity(0.72)], startPoint: .top, endPoint: .bottom)
                )
            } else {
                shape.fill(tint.opacity(0.12))
                    .overlay(shape.stroke(tint.opacity(0.35), lineWidth: 1))
            }
        }
        .accessibilityLabel(text)
    }
}
