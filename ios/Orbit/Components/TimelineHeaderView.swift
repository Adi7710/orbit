import SwiftUI

/// The honest ledger, at the top of the day.
///
/// It reads as glass but it is not a material: this view scrolls with the list,
/// and a blur that has to re-sample its backdrop on every frame of a scroll is
/// the single most expensive thing you can put in a scroll view. The glass here
/// is an opaque fill, a tinted gradient and a one-point lit edge, which is a
/// flat composite. Materials on this screen are reserved for things that do not
/// move: the docked action bar, the toast, and the expanded class.
struct TimelineHeaderView: View {
    let user: Today.User
    let ledger: Today.Ledger
    let clockText: String
    let simulatedClock: Bool
    let mode: Today.Mode
    let onModeChange: (Today.Mode) -> Void

    /// Mirrors `hm()` in `src/app/TodayClient.tsx` so the two clients word a
    /// duration identically. This formats a number the server sent; it does not
    /// work out what the number should be.
    private func hm(_ minutes: Int) -> String {
        let m = abs(minutes)
        return m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
    }

    /// How much of the usable day is already spoken for. A proportion of two
    /// server numbers, drawn as a ring.
    private var committedFraction: Double {
        guard ledger.usable > 0 else { return 1 }
        return min(1, Double(ledger.queued) / Double(ledger.usable))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            greeting
            ledgerRow
            breakdown
            modePicker
        }
        .padding(18)
        .background {
            let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
            ZStack {
                shape.fill(
                    Color.orbitSurface
                        .shadow(.drop(color: .black.opacity(0.20), radius: 14, y: 8))
                )
                shape.fill(
                    LinearGradient(
                        colors: [Color.orbitAccent.opacity(0.16), Color.orbitLive.opacity(0.06)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                shape.strokeBorder(LinearGradient.orbitEdge, lineWidth: 1)
            }
        }
    }

    // MARK: - Pieces

    private var greeting: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Hey \(user.name)")
                .font(.orbitTitle)
                .foregroundStyle(Color.orbitInk)
            Spacer()
            HStack(spacing: 10) {
                Label("\(user.streakWeeks)", systemImage: "flame.fill")
                    .foregroundStyle(Color.orbitUrgent)
                Text("\(user.xpWeek) XP")
                    .foregroundStyle(Color.orbitAccent)
            }
            .font(.orbitCaption)
            .monospacedDigit()
        }
    }

    private var ledgerRow: some View {
        HStack(alignment: .center, spacing: 16) {
            CircularProgressRing(progress: committedFraction, tint: .orbitAccent, lineWidth: 7) {
                VStack(spacing: 0) {
                    Text(hm(ledger.usable))
                        .font(.system(.footnote, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                    Text("usable")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }
            .frame(width: 84, height: 84)

            VStack(alignment: .leading, spacing: 4) {
                Text(hm(ledger.usable))
                    .font(.orbitDisplay)
                    .monospacedDigit()
                    .foregroundStyle(Color.orbitInk)
                    .contentTransition(.numericText())

                HStack(spacing: 6) {
                    Text("your calendar says")
                        .font(.orbitCaption)
                        .foregroundStyle(Color.orbitInkFaint)
                    Text(hm(ledger.naiveFree))
                        .font(.orbitCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInkFaint)
                        .strikethrough(true, color: .orbitUrgent)
                }

                if ledger.overCommitted {
                    GradientTagView(
                        text: "\(hm(ledger.slack)) over",
                        tint: .orbitUrgent,
                        systemImage: "exclamationmark.triangle.fill",
                        filled: true
                    )
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var breakdown: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Missing \(hm(ledger.frictionMinutes)) = \(hm(ledger.travel)) walking + \(hm(ledger.meals)) meals + \(hm(ledger.routines)) settling")
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInkSoft)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Image(systemName: simulatedClock ? "clock.badge.exclamationmark" : "clock")
                Text(simulatedClock ? "\(clockText) · demo clock" : clockText)
            }
            .font(.orbitCaption)
            .monospacedDigit()
            .foregroundStyle(simulatedClock ? Color.orbitUrgent : Color.orbitInkFaint)
        }
    }

    private var modePicker: some View {
        Picker("Mode", selection: Binding(get: { mode }, set: onModeChange)) {
            ForEach(Today.Mode.allCases, id: \.self) { m in
                Text(m.label).tag(m)
            }
        }
        .pickerStyle(.segmented)
        .sensoryFeedback(.selection, trigger: mode)
    }
}
