import SwiftUI

/// The honest ledger, drawn as concentric arcs.
///
/// The claim your calendar makes is the whole circle. Each ring is one thing
/// that quietly takes a bite out of it — class, the walk, the meals, getting
/// settled — drawn outside in, and what is left over sits in the middle. The
/// argument the product makes in one shape: the hole in your day is not one
/// big thing, it is four small ones nobody was counting.
///
/// **Every minute here was computed on the server.** `fraction` divides two
/// numbers the server sent purely to place a mark on an arc, which is the same
/// thing `TimelineHeaderView.committedFraction` already did for the dial. No
/// duration is derived, summed or adjusted on the phone; `hm` only formats.
///
/// Ring colour is fixed per band and never follows the mode — see
/// `OrbitModeChrome`.
struct LedgerRingsView: View {

    let ledger: Today.Ledger
    let chrome: OrbitModeChrome

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Geometry

    /// Sized so that four rings still leave a clear disc in the middle wide
    /// enough for the readout. Inner edge lands at r=50, and the centre stack
    /// is capped at 96pt across, so the innermost arc can never cross it.
    private let diameter: CGFloat = 232
    private let line: CGFloat = 12
    private let gap: CGFloat = 6

    private func radius(_ index: Int) -> CGFloat {
        (diameter / 2 - line / 2) - CGFloat(index) * (line + gap)
    }

    // MARK: - Bands

    private struct Band: Identifiable {
        let id: String
        let label: String
        let minutes: Int
        let color: Color
    }

    private var bands: [Band] {
        // Class only belongs here when the whole is `awake`. Against
        // `naiveFree` it would be a slice of a pie it was already cut out of.
        let classBand = ledger.awake.map {
            _ in Band(id: "fixed", label: "Class", minutes: ledger.fixed,
                      color: .orbit(light: OrbitToken.limeDeep, dark: OrbitToken.lime))
        }
        return [
            classBand,
            Band(id: "travel", label: "Walking", minutes: ledger.travel,
                 color: .orbit(light: OrbitToken.tealDeep, dark: OrbitToken.teal)),
            Band(id: "meals", label: "Meals", minutes: ledger.meals,
                 color: .orbit(light: OrbitToken.emberDeep, dark: OrbitToken.ember)),
            Band(id: "routines", label: "Settling", minutes: ledger.routines,
                 color: .orbit(light: OrbitToken.roseDeep, dark: OrbitToken.rose))
        ].compactMap { $0 }
    }

    /// The whole the arcs are drawn against: the waking day, which every band
    /// plus `usable` adds up to. Falls back to the claim on an older server,
    /// where the Class band is dropped so the remaining three stay exact.
    /// Guarded so a zero draws an empty ring rather than dividing by nothing.
    private var claim: Int { max(1, ledger.awake ?? ledger.naiveFree) }

    private func fraction(_ minutes: Int) -> Double {
        min(1, max(0, Double(minutes) / Double(claim)))
    }

    /// Formats a number the server sent. It does not decide what the number is.
    private static func hm(_ minutes: Int) -> String {
        let m = abs(minutes)
        return m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 20) {
            rings
            meters
        }
        .animation(chrome.animation, value: ledger.usable)
    }

    private var rings: some View {
        ZStack {
            ForEach(Array(bands.enumerated()), id: \.element.id) { index, band in
                let r = radius(index)

                Circle()
                    .stroke(band.color.opacity(0.16), lineWidth: line)
                    .frame(width: r * 2, height: r * 2)

                Circle()
                    .trim(from: 0, to: fraction(band.minutes))
                    .stroke(band.color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                    .frame(width: r * 2, height: r * 2)
                    .rotationEffect(.degrees(-90))
                    .animation(OrbitMotion.sweep(reduceMotion), value: band.minutes)
            }

            centre
        }
        .frame(width: diameter, height: diameter)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    private var centre: some View {
        VStack(spacing: 1) {
            Text(Self.hm(ledger.usable))
                .font(Font.system(.title, design: .default, weight: .bold).width(chrome.titleWidth))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(Color.orbitInk)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(chrome.label("usable"))
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)

            if ledger.overCommitted {
                Text(Self.hm(ledger.slack) + " over")
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitOnAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.orbitUrgent))
                    .padding(.top, 3)
            }
        }
        .frame(maxWidth: 96)
    }

    /// One labelled bar per ring. Colour is never the only encoding: each band
    /// is named and carries its own number.
    private var meters: some View {
        VStack(spacing: 9) {
            ForEach(bands) { band in
                HStack(spacing: 10) {
                    Text(band.label)
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkSoft)
                        .frame(width: 74, alignment: .leading)
                        .lineLimit(1)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(band.color.opacity(0.16))
                            Capsule()
                                .fill(band.color)
                                .frame(width: max(3, geo.size.width * fraction(band.minutes)))
                        }
                    }
                    .frame(height: 7)

                    Text(Self.hm(band.minutes))
                        .font(.system(.caption, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInkFaint)
                        .frame(width: 54, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(band.label) \(Self.hm(band.minutes))")
            }
        }
    }

    private var spoken: String {
        let parts = bands.map { "\($0.label) \(Self.hm($0.minutes))" }.joined(separator: ", ")
        return "Of \(Self.hm(claim)) awake, \(Self.hm(ledger.usable)) is actually usable. \(parts)."
    }
}
