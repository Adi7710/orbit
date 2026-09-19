import SwiftUI

/// One real window between commitments, with the one thing the server picked
/// for it. Not a to-do row: the window is the subject, the task is what fits
/// inside it.
///
/// No material here. There can be several of these and they scroll.
struct GapCardRow: View {
    let gap: Today.Gap
    /// Looked up from `tasks` by the parent so the spine can be the domain
    /// colour of the task; nil when the server picked nothing.
    let domain: String?
    let onDone: () -> Void

    private var tint: Color { domain.map { Color.orbitDomain($0) } ?? .orbitAccent }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Capsule()
                .fill(LinearGradient(colors: [tint, tint.opacity(0.2)], startPoint: .top, endPoint: .bottom))
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text("\(gap.startText)-\(gap.endText)")
                        .font(.orbitHeadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                    GradientTagView(text: "\(gap.usable) min", tint: tint)
                    if gap.isEvening {
                        GradientTagView(text: "Evening", tint: .orbitInkSoft, systemImage: "moon.stars")
                    }
                }

                if let pick = gap.pick {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pick.title)
                                .font(.orbitBody)
                                .foregroundStyle(Color.orbitInk)
                            Text("\(pick.estimateMinutes) min estimated")
                                .font(.orbitCaption)
                                .foregroundStyle(Color.orbitInkFaint)
                        }
                        Spacer(minLength: 8)
                        Button("Done", action: onDone)
                            .font(.orbitCaption)
                            .buttonStyle(.borderedProminent)
                            .tint(tint)
                            .buttonBorderShape(.capsule)
                    }
                } else {
                    Text("Nothing fits. Enjoy it.")
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkFaint)
                }

                if let from = gap.fromPlace {
                    Label("from \(from)", systemImage: "figure.walk")
                        .font(.orbitCaption)
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface.shadow(.drop(color: .black.opacity(0.14), radius: 8, y: 4)))
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
    }
}
