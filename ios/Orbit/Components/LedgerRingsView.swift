import SwiftUI

/// The honest ledger, drawn as concentric rings.
///
/// The waking day is the whole circle. Each ring is one thing that quietly
/// takes a bite out of it — class, the walk, the meals, getting settled —
/// drawn outside in, with what survives in the middle. The argument the
/// product makes, in one shape: the hole in your day is not one big thing,
/// it is four small ones nobody was counting.
///
/// **Every minute here was computed on the server.** `fraction` divides two
/// numbers the server sent in order to place a mark on an arc, which is what
/// the dial this replaced already did. Nothing is derived, summed or adjusted
/// on the phone; `OrbitDuration.hm` formats and nothing more.
///
/// One deliberate departure from the design being reproduced. It draws these
/// at a 20pt stroke with 4pt between, which at four rings leaves a clear
/// centre of r=23 — too small for a 30pt count and its caption, so the
/// innermost ring crosses the label. Verified on device in the app it comes
/// from. Here the stroke is 14 and the clear centre is r=50, and the centre
/// stack is capped narrower still so the arcs can never reach it.
struct LedgerRingsView: View {

    let ledger: Today.Ledger
    let chrome: OrbitModeChrome

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Geometry

    private let diameter: CGFloat = 236
    private let line: CGFloat = 14
    private let spacing: CGFloat = 4

    private func radius(_ index: Int) -> CGFloat {
        (diameter / 2 - line / 2) - CGFloat(index) * (line + spacing)
    }

    // MARK: - Bands

    private struct Band: Identifiable {
        let id: String
        let label: String
        let minutes: Int
        let color: Color
    }

    /// One hue, four depths. The four domain hues are reserved for the four
    /// domains — a task is LEARN blue everywhere it appears — and the ledger
    /// is not four domains, it is one day taken apart. Borrowing BUILD's teal
    /// for meals and LIFE's purple for settling made a hue mean two things on
    /// one screen, which OrbitModeChrome's own rule forbids. So the bands are
    /// the primary at four tints, outside in, darkest first. Lightness is the
    /// one axis every kind of colour vision keeps, and each band carries its
    /// own label and number in the meters below, so the tints are never the
    /// only encoding.
    private var bands: [Band] {
        let classBand = ledger.awake.map { _ in
            Band(id: "fixed", label: "Class", minutes: ledger.fixed, color: Self.tint(0))
        }
        return [
            classBand,
            Band(id: "travel", label: "Walking", minutes: ledger.travel, color: Self.tint(1)),
            Band(id: "meals", label: "Meals", minutes: ledger.meals, color: Self.tint(2)),
            Band(id: "routines", label: "Settling", minutes: ledger.routines, color: Self.tint(3))
        ].compactMap { $0 }
    }

    /// Primary at 100 / 72 / 52 / 36 percent. The lightest still clears 3:1
    /// against white as a 14pt arc because it sits on its own 16 percent track.
    private static func tint(_ depth: Int) -> Color {
        let opacities: [Double] = [1.0, 0.72, 0.52, 0.36]
        return Color(hex: OrbitClassic.primary).opacity(opacities[min(depth, opacities.count - 1)])
    }

    /// The whole the arcs are drawn against: the waking day, which every band
    /// plus `usable` adds up to exactly. Falls back to the calendar's claim on
    /// an older server, where the Class band is dropped so the remaining three
    /// stay true. Guarded so a zero draws an empty ring rather than dividing
    /// by nothing.
    private var whole: Int { max(1, ledger.awake ?? ledger.naiveFree) }

    private func fraction(_ minutes: Int) -> Double {
        min(1, max(0, Double(minutes) / Double(whole)))
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 22) {
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
        VStack(spacing: 2) {
            Text(OrbitDuration.hm(ledger.usable))
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(OrbitClassic.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.65)

            Text(chrome.label("usable"))
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(OrbitClassic.inkSoft)

            // Ink on a well, not white on crimson. theme.md section 2.4: there
            // is no colour for the student doing badly, and "over" is the
            // student's own day. The number is the information; a red pill
            // is the app deciding how they should feel about it.
            if ledger.overCommitted {
                Text(OrbitDuration.hm(ledger.slack) + " over")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .monospacedDigit()
                    .foregroundStyle(OrbitClassic.ink)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(OrbitClassic.surfaceDeep))
                    .padding(.top, 3)
            }
        }
        .frame(maxWidth: 86)
    }

    /// One labelled bar per ring: name, track, number. A proportion read
    /// rather than admired, and colour is never the only encoding.
    private var meters: some View {
        VStack(spacing: 9) {
            ForEach(bands) { band in
                HStack(spacing: 10) {
                    Text(band.label.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(OrbitClassic.inkSoft)
                        .frame(width: 78, alignment: .leading)
                        .lineLimit(1)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(band.color.opacity(0.15))
                            Capsule()
                                .fill(band.color)
                                .frame(width: max(3, geo.size.width * fraction(band.minutes)))
                        }
                    }
                    .frame(height: 8)

                    Text(OrbitDuration.hm(band.minutes))
                        .font(.system(size: 11, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(OrbitClassic.inkSoft)
                        .frame(width: 58, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(band.label) \(OrbitDuration.hm(band.minutes))")
            }
        }
    }

    private var spoken: String {
        let parts = bands.map { "\($0.label) \(OrbitDuration.hm($0.minutes))" }.joined(separator: ", ")
        return "Of \(OrbitDuration.hm(whole)) awake, \(OrbitDuration.hm(ledger.usable)) is actually usable. \(parts)."
    }
}
