import SwiftUI

/// The small pill used for statuses, counts and course codes.
///
/// Flat, not gradient-bordered: in this system a pill is either *filled*,
/// which means it is the one accented thing, or it is a quiet inset chip.
/// There is no third, decorative state. One rounded rect, one label, no
/// material and no shadow — there can be a dozen on screen.
struct GradientTagView: View {
    let text: String
    var tint: Color = .orbitAccentInk
    var systemImage: String?
    /// A filled pill reads as "this is the one"; an inset one as a label.
    var filled: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 9, weight: .semibold))
            }
            Text(text)
        }
        .orbitEyebrow()
        .foregroundStyle(filled ? Color.orbitOnAccent : tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background {
            let shape = Capsule(style: .continuous)
            if filled {
                shape.fill(tint)
            } else {
                shape.fill(Color.orbitSurfaceInset)
            }
        }
        .accessibilityLabel(text)
    }
}
