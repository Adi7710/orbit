import SwiftUI

/// The honest ledger.
///
/// Structured the way the reference structures its climate screen: a quiet
/// title, two small readings side by side, a row of circular mode chips, and
/// then one large dial that is unmistakably the subject of the screen. Here
/// the dial reads how much of your usable day is already spoken for.
///
/// It reads as glass but it is not a material: this view scrolls, and a blur
/// that re-samples its backdrop every frame is the most expensive thing you
/// can put in a scroll view. Materials on this screen are reserved for the
/// docked bar and the toast, which do not move.
struct TimelineHeaderView: View {
    let user: Today.User
    let ledger: Today.Ledger
    let clockText: String
    let simulatedClock: Bool
    let mode: Today.Mode
    let onModeChange: (Today.Mode) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Mirrors `hm()` in `src/app/TodayClient.tsx` so the two clients word a
    /// duration identically. This formats a number the server sent; it does
    /// not work out what the number should be.
    private func hm(_ minutes: Int) -> String {
        let m = abs(minutes)
        return m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
    }

    /// Corner radius, display face and pace for the mode that is on. Colour
    /// meaning is not in here — see `OrbitModeChrome`.
    private var chrome: OrbitModeChrome {
        .on(mode, reduceMotion: reduceMotion)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            greeting.orbitAppear(0)
            readings.orbitAppear(1)
            modeChips.orbitAppear(2)
            ledgerRings.orbitAppear(3)
            breakdown.orbitAppear(4)
        }
    }

    // MARK: - Pieces

    private var greeting: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(simulatedClock ? "Today · \(clockText) · demo clock" : "Today · \(clockText)")
                    .orbitEyebrow()
                    .foregroundStyle(simulatedClock ? Color.orbitUrgent : Color.orbitInkFaint)
                Text(chrome.label("Hey \(user.name)"))
                    .font(chrome.title())
                    .tracking(chrome.titleTracking)
                    .foregroundStyle(Color.orbitInk)
            }
            Spacer()
            HStack(spacing: 4) {
                Text("\(user.streakWeeks)w")
                Text("·")
                Text("\(user.xpWeek) XP")
            }
            .orbitEyebrow()
            .monospacedDigit()
            .foregroundStyle(Color.orbitInkSoft)
        }
    }

    /// Two readings, side by side, the way the reference shows outside and
    /// inside temperature.
    private var readings: some View {
        HStack(spacing: 10) {
            reading(label: "Actually usable", value: hm(ledger.usable), struck: false)
            reading(label: "Calendar claims", value: hm(ledger.naiveFree), struck: true)
        }
    }

    private func reading(label: String, value: String, struck: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)
            Text(value)
                .font(.orbitNumeric)
                .foregroundStyle(struck ? Color.orbitInkSoft : Color.orbitInk)
                .strikethrough(struck, color: .orbitUrgent)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: chrome.corner, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: chrome.corner, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
    }

    /// Circular icon chips, one filled. The reference uses exactly this for
    /// Air / Heat / Cold / Humid.
    private var modeChips: some View {
        HStack(spacing: 12) {
            ForEach(Today.Mode.allCases, id: \.self) { candidate in
                Button {
                    onModeChange(candidate)
                } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            Circle()
                                .fill(candidate == mode ? chrome.accent : Color.orbitSurface)
                            Circle()
                                .strokeBorder(Color.orbitHairline, lineWidth: candidate == mode ? 0 : 1)
                            Image(systemName: icon(for: candidate))
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(candidate == mode ? chrome.onAccent : Color.orbitInkSoft)
                        }
                        .frame(width: 46, height: 46)
                        .orbitBloom(chrome.accent, active: candidate == mode, radius: 12)

                        Text(candidate.label)
                            .orbitEyebrow()
                            .foregroundStyle(candidate == mode ? Color.orbitInk : Color.orbitInkFaint)
                    }
                }
                .buttonStyle(.orbitTile)
                .accessibilityLabel("\(candidate.label) mode")
                .accessibilityAddTraits(candidate == mode ? [.isButton, .isSelected] : .isButton)
            }
            Spacer(minLength: 0)
        }
        .animation(chrome.animation, value: mode)
        .sensoryFeedback(.selection, trigger: mode)
    }

    /// The subject of the screen: what the calendar claimed, and the four
    /// things that quietly take it apart. Replaces the single committed-vs-
    /// usable dial, which could show the proportion but never the reason.
    private var ledgerRings: some View {
        LedgerRingsView(ledger: ledger, chrome: chrome)
    }

    private var breakdown: some View {
        // The three parts are already named and numbered by the meters above,
        // so this line carries only the total they add up to.
        Text("\(hm(ledger.frictionMinutes)) of today goes to getting there, eating and settling in.")
            .font(.orbitBody)
            .foregroundStyle(Color.orbitInkSoft)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func icon(for mode: Today.Mode) -> String {
        switch mode {
        case .normal: return "circle.grid.2x2"
        case .crisis: return "bolt.fill"
        case .chill:  return "moon"
        }
    }
}
