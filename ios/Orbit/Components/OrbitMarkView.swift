import SwiftUI

/// Four concentric rings at any size: the logo, and the empty state of the
/// real thing — the same shape either way.
struct OrbitMark: View {

    var size: CGFloat = 18

    /// Outside in, in the order the rings are earned.
    private let hues: [Color] = [.classicBody, .classicLearn, .classicBuild, .classicLife]

    var body: some View {
        ZStack {
            ForEach(Array(hues.enumerated()), id: \.offset) { index, hue in
                Circle()
                    .strokeBorder(hue, lineWidth: size * 0.11)
                    .frame(width: size - CGFloat(index) * size * 0.25)
            }
        }
        .frame(width: size, height: size)
    }
}

/// ORBIT, with the O drawn as the rings themselves.
struct OrbitWordmark: View {

    var size: CGFloat = 17

    var body: some View {
        HStack(spacing: 2) {
            OrbitMark(size: size)
            Text("RBIT")
                .font(.system(size: size - 1, weight: .semibold, design: .rounded))
                .tracking(2.2)
                .foregroundStyle(OrbitClassic.ink)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Orbit")
    }
}
