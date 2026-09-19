import SwiftUI

/// "Leave by 13:16 - 71B live". Every string here was composed by the server,
/// by the same buildJourney() the map screen uses, so the strip and the map
/// can never disagree about when to stand up.
struct BusStripView: View {
    let bus: Today.Bus

    private var tint: Color {
        guard let verdict = bus.verdict else { return .orbitAccent }
        if !verdict.makesIt { return .orbitUrgent }
        return verdict.marginMin < 5 ? .orbitUrgent : .orbitAccent
    }

    private var routeTag: String {
        if bus.live { return "\(bus.route) live" }
        if bus.ghost { return "\(bus.route) ghost" }
        return bus.route
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(tint.opacity(0.15))
                Image(systemName: "bus.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(tint)
            }
            .frame(width: 42, height: 42)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("Leave by \(bus.leaveByText)")
                        .font(.orbitHeadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                    GradientTagView(
                        text: routeTag,
                        tint: bus.live ? .orbitLive : .orbitInkSoft,
                        systemImage: bus.live ? "dot.radiowaves.up.forward" : nil,
                        filled: bus.live
                    )
                }
                Text("\(bus.walkToStop) min walk to \(bus.stopName), \(bus.rideMinutes) min ride, \(bus.why)")
                    .font(.orbitCaption)
                    .foregroundStyle(Color.orbitInkSoft)
                    .lineLimit(2)
                if let verdict = bus.verdict, let at = bus.classAtText {
                    Text(verdictText(verdict, at: at))
                        .font(.orbitCaption)
                        .foregroundStyle(tint)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface.shadow(.drop(color: .black.opacity(0.14), radius: 8, y: 4)))
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(tint.opacity(0.28), lineWidth: 1)
                )
        }
    }

    private func verdictText(_ verdict: Today.Bus.Verdict, at: String) -> String {
        verdict.makesIt
            ? "Makes \(at) with \(verdict.marginMin) min to spare"
            : "Misses \(at) by \(abs(verdict.marginMin)) min"
    }
}
