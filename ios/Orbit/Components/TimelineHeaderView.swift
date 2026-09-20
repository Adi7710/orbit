import SwiftUI

/// The honest ledger.
///
/// Beat one of the demo, in one column: the wordmark, a greeting, the
/// calendar's claim struck through, and then the rings, which say the real
/// number once, in the middle, with the four things that took it apart drawn
/// around it. The ledger used to be stated three times on the way down —
/// two reading cards, the ring centre, the fits card — and a number said
/// three times reads as three numbers. Now the claim is said once and the
/// truth is said once. Controls come after the subject: the mode strip sits
/// below the rings, not between the greeting and the thing it is about.
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

    /// One formatter for the whole app: `OrbitDuration.hm`. This view had its
    /// own, which wrote "1h 0m" where the rings wrote "1h" — two spellings of
    /// one number on one screen.
    private func hm(_ minutes: Int) -> String { OrbitDuration.hm(minutes) }

    /// Corner radius, display face and pace for the mode that is on. Colour
    /// meaning is not in here — see `OrbitModeChrome`.
    private var chrome: OrbitModeChrome {
        .on(mode, reduceMotion: reduceMotion)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            greeting.orbitAppear(0)
            claim.orbitAppear(1)
            ledgerRings.orbitAppear(2)
            breakdown.orbitAppear(3)
            modeChips.orbitAppear(4)
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

    /// The calendar's number, crossed out. docs/copy.md `today.ledger.claimed`:
    /// "your calendar says 13h 35m". The real number is not repeated here; it
    /// is the centre of the rings directly below, said once.
    private var claim: some View {
        HStack(spacing: 6) {
            Text("your calendar says")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(OrbitClassic.inkSoft)
            // No line through it, by Adi's call. The soft ink and the real
            // number sitting large in the rings below are enough to say which
            // one to believe.
            Text(hm(ledger.naiveFree))
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(OrbitClassic.inkSoft)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your calendar says \(hm(ledger.naiveFree)).")
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
