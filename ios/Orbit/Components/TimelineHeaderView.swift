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
        VStack(spacing: 16) {
            // The wordmark sits centred with the day's facts either side of
            // it, the way the design opens every screen.
            ZStack {
                OrbitWordmark()
                HStack {
                    Text(simulatedClock ? "\(clockText) · demo" : clockText)
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.6)
                        .monospacedDigit()
                        .foregroundStyle(simulatedClock ? Color(hex: OrbitClassic.crisis) : OrbitClassic.inkFaint)
                    Spacer()
                    Text("\(user.streakWeeks)w · \(user.xpWeek) XP")
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(OrbitClassic.inkSoft)
                }
            }

            Text(chrome.label("Hey \(user.name)"))
                .font(chrome.title(.title))
                .tracking(chrome.titleTracking)
                .foregroundStyle(OrbitClassic.ink)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
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
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(OrbitClassic.inkFaint)
            Text(value)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(struck ? OrbitClassic.inkSoft : OrbitClassic.ink)
                .strikethrough(struck, color: Color(hex: OrbitClassic.body))
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: chrome.corner, style: .continuous)
                .fill(OrbitClassic.surface)
        }
    }

    /// A segmented control, the way the design picks a mode: one strip, the
    /// live segment filled with whatever accent the mode brought with it.
    private var modeChips: some View {
        HStack(spacing: 4) {
            ForEach(Today.Mode.allCases, id: \.self) { candidate in
                Button {
                    onModeChange(candidate)
                } label: {
                    Text(chrome.label(candidate.label))
                        .font(.system(size: 14, weight: .semibold))
                        .tracking(chrome.titleTracking > 0 ? 0.6 : 0)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: max(5, chrome.corner - 5), style: .continuous)
                                .fill(candidate == mode ? chrome.accent : Color.clear)
                        )
                        .foregroundStyle(candidate == mode ? chrome.onAccent : OrbitClassic.inkSoft)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(candidate.label) mode")
                .accessibilityAddTraits(candidate == mode ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: max(8, chrome.corner - 2), style: .continuous)
                .fill(OrbitClassic.surface)
        )
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
            .font(.subheadline)
            .foregroundStyle(OrbitClassic.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
    }
}
