import SwiftUI

/// "Leave by 19:32". Every string here was composed by the server, by the same
/// buildJourney() the map screen uses, so the strip and the map can never
/// disagree about when to stand up.
///
/// Neutral unless the margin is thin. Ember is the only colour that appears
/// here, and only when you are actually about to miss something — in this
/// system a warm colour is information, never decoration.
struct BusStripView: View {
    let bus: Today.Bus
    var index: Int = 0

    private var isTight: Bool {
        guard let verdict = bus.verdict else { return false }
        return !verdict.makesIt || verdict.marginMin < 5
    }

    private var tint: Color { isTight ? .orbitUrgent : .orbitInkSoft }

    private var routeTag: String {
        if bus.live { return "\(bus.route) live" }
        if bus.ghost { return "\(bus.route) ghost" }
        return bus.route
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Color.orbitSurfaceInset)
                Image(systemName: "bus.fill")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(tint)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("Leave by \(bus.leaveByText)")
                        .font(.orbitHeadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                    GradientTagView(
                        text: routeTag,
                        tint: bus.live ? .orbitAccentInk : .orbitInkFaint,
                        systemImage: bus.live ? "dot.radiowaves.up.forward" : nil
                    )
                }
                Text("\(bus.walkToStop) min walk to \(bus.stopName), \(bus.rideMinutes) min ride, \(bus.why)")
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInkFaint)
                    .lineLimit(2)
                if let verdict = bus.verdict, let at = bus.classAtText {
                    Text(verdictText(verdict, at: at))
                        .orbitEyebrow()
                        .foregroundStyle(tint)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(isTight ? Color.orbitUrgent.opacity(0.35) : Color.orbitHairline, lineWidth: 1)
                )
        }
        .orbitAppear(index)
    }

    private func verdictText(_ verdict: Today.Bus.Verdict, at: String) -> String {
        verdict.makesIt
            ? "Makes \(at) with \(verdict.marginMin) min to spare"
            : "Misses \(at) by \(abs(verdict.marginMin)) min"
    }
}
