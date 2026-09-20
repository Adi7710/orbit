import SwiftUI

/// Where today goes, written as a permission slip rather than a refusal.
///
/// The same arithmetic either way — and all of it the server's. The voice is
/// the whole difference between an app you open tomorrow and one you avoid,
/// which is why the over-committed case says what you may stop carrying
/// rather than what you failed to fit.
struct LedgerSheet: View {

    let ledger: Today.Ledger
    let cuts: [Today.Cut]

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {

                    Text(headline)
                        .font(.headline)
                        .foregroundStyle(OrbitClassic.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(explanation)
                        .font(.subheadline)
                        .foregroundStyle(OrbitClassic.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)

                    Divider()

                    VStack(spacing: 7) {
                        // `awake` is the only one the server may not send on an
                        // older deploy; the rest of the slip still balances
                        // against what it does send.
                        if let awake = ledger.awake {
                            row("Awake today", awake)
                        }
                        row("Class and commitments", -ledger.fixed)
                        row("Getting there and back", -ledger.travel)
                        row("Meals", -ledger.meals)
                        row("Morning and wind-down", -ledger.routines)
                        Divider()
                        row("Yours to spend", ledger.usable, emphasised: true)
                    }

                    if let first = cuts.first {
                        Divider()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("The easiest thing to let go")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(OrbitClassic.inkSoft)
                            HStack {
                                Text(first.task.title)
                                    .font(.subheadline)
                                    .foregroundStyle(OrbitClassic.ink)
                                Spacer()
                                Text("−" + OrbitDuration.hm(first.minutesSaved))
                                    .font(.caption)
                                    .monospacedDigit()
                                    .foregroundStyle(OrbitClassic.inkSoft)
                            }
                        }
                    }
                }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(OrbitClassic.surface)
                )
                .padding(16)
            }
            .background(OrbitClassic.ground.ignoresSafeArea())
            .navigationTitle("Where today goes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var headline: String {
        ledger.overCommitted
            ? "Today is \(OrbitDuration.hm(ledger.slack)) over."
            : "You have \(OrbitDuration.hm(ledger.slack)) spare today."
    }

    private var explanation: String {
        ledger.overCommitted
            ? "The rest isn't happening, and that's fine — you can stop carrying it until tomorrow."
            : "That's after \(OrbitDuration.hm(ledger.frictionMinutes)) of walking, eating and getting ready, which nothing else counts."
    }

    private func row(_ label: String, _ minutes: Int, emphasised: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(emphasised ? .subheadline.weight(.semibold) : .subheadline)
            Spacer()
            Text(OrbitDuration.hm(minutes))
                .font(.subheadline)
                .monospacedDigit()
                .fontWeight(emphasised ? .semibold : .regular)
        }
        .foregroundStyle(emphasised ? OrbitClassic.ink : OrbitClassic.inkSoft)
    }
}
