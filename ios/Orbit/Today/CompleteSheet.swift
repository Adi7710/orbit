import SwiftUI

/// Marking something done asks one question: how long did it actually take?
///
/// That answer is the whole point of Orbit. It is what the estimator
/// calibrates on, so the sheet defaults to the estimate and makes moving away
/// from it easy, rather than pre-filling the honest answer with the
/// convenient one.
struct CompleteSheet: View {
    let title: String
    let estimateMinutes: Int
    let onConfirm: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var minutes: Int

    init(title: String, estimateMinutes: Int, onConfirm: @escaping (Int) -> Void) {
        self.title = title
        self.estimateMinutes = estimateMinutes
        self.onConfirm = onConfirm
        _minutes = State(initialValue: estimateMinutes)
    }

    private let choices: [Int] = Array(stride(from: 5, through: 240, by: 5))

    /// How far off the estimate this answer is. Shown as a plain statement,
    /// never as a judgement — the estimator wants the truth, and a sheet that
    /// frowns at you teaches you to lie to it.
    private var driftNote: String {
        let delta = minutes - estimateMinutes
        if delta == 0 { return "Exactly the estimate" }
        return delta > 0 ? "\(delta) min over the estimate" : "\(-delta) min under the estimate"
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitInkSoft)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)

            VStack(spacing: 6) {
                Text("How long did it take?")
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitInkFaint)
                Text(title)
                    .font(.orbitTitle)
                    .orbitTightDisplay()
                    .foregroundStyle(Color.orbitInk)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 10)
            .padding(.horizontal, 24)

            Picker("Actual minutes", selection: $minutes) {
                ForEach(choices, id: \.self) { value in
                    Text("\(value) min").tag(value)
                }
            }
            .pickerStyle(.wheel)
            .sensoryFeedback(.selection, trigger: minutes)

            Text(driftNote)
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)
                .contentTransition(.numericText())
                .animation(.default, value: minutes)

            Button {
                onConfirm(minutes)
                dismiss()
            } label: {
                Text("Log \(minutes) minutes")
                    .font(.orbitHeadline)
                    .foregroundStyle(Color.orbitOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(LinearGradient.orbitAccent, in: Capsule())
                    .contentTransition(.numericText())
            }
            .buttonStyle(.orbitTile)
            .orbitBloom(.orbitAccent, radius: 16)
            .padding(.horizontal, 20)
            .padding(.top, 14)

            Text("XP is worked out on the server from the minutes you actually spent.")
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInkFaint)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
                .padding(.top, 12)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity)
        .background(Color.orbitBackground)
        .presentationDetents([.height(460)])
        .presentationBackground(Color.orbitBackground)
        .presentationCornerRadius(OrbitMetric.cardRadius)
    }
}
