import SwiftUI

/// One real window between commitments, with the one thing the server picked
/// for it. Not a to-do row: the window is the subject, the task is what fits
/// inside it.
///
/// Neutral by design. The lime on this screen belongs to the class that is
/// happening now and to the primary action in the docked bar; a row of lime
/// Done buttons would spend the accent until it stopped meaning anything.
/// The domain colour appears only as the four-point spine.
struct GapCardRow: View {
    let gap: Today.Gap
    /// Looked up from `tasks` by the parent so the spine can be the domain
    /// colour of the task; nil when the server picked nothing.
    let domain: String?
    var index: Int = 0
    let onDone: () -> Void

    private var tint: Color { domain.map { Color.orbitDomain($0) } ?? .orbitInkSoft }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Capsule()
                .fill(LinearGradient(colors: [tint, tint.opacity(0.25)], startPoint: .top, endPoint: .bottom))
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("\(gap.startText)–\(gap.endText)")
                        .font(.orbitHeadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                    GradientTagView(text: "\(gap.usable) min", tint: tint)
                    if gap.isEvening {
                        GradientTagView(text: "Evening", tint: .orbitInkFaint, systemImage: "moon")
                    }
                }

                if let pick = gap.pick {
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(pick.title)
                                .font(.orbitBody)
                                .foregroundStyle(Color.orbitInk)
                            Text("\(pick.estimateMinutes) min estimated")
                                .orbitEyebrow()
                                .foregroundStyle(Color.orbitInkFaint)
                        }
                        Spacer(minLength: 8)
                        Button(action: onDone) {
                            Text("Done")
                                .orbitEyebrow()
                                .foregroundStyle(Color.orbitAccentInk)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 9)
                                .background(
                                    Capsule().strokeBorder(Color.orbitAccentInk.opacity(0.45), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.orbitTile)
                    }
                } else {
                    Text("Nothing fits. Enjoy it.")
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkFaint)
                }

                if let from = gap.fromPlace {
                    Text("from \(from)")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
        .orbitAppear(index)
    }
}
