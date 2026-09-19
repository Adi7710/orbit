import SwiftUI

/// Marking something done asks one question: how long did it actually take?
///
/// That answer is the whole point of Orbit. It is what the estimator calibrates
/// on, so the sheet defaults to the estimate and makes moving away from it
/// easy, rather than pre-filling the honest answer with the convenient one.
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

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(spacing: 4) {
                    Text(title)
                        .font(.orbitTitle)
                        .foregroundStyle(Color.orbitInk)
                        .multilineTextAlignment(.center)
                    Text("Estimated \(estimateMinutes) min")
                        .font(.orbitCaption)
                        .foregroundStyle(Color.orbitInkFaint)
                }

                Picker("Actual minutes", selection: $minutes) {
                    ForEach(choices, id: \.self) { value in
                        Text("\(value) min").tag(value)
                    }
                }
                .pickerStyle(.wheel)
                .sensoryFeedback(.selection, trigger: minutes)

                Button {
                    onConfirm(minutes)
                    dismiss()
                } label: {
                    Text("Log \(minutes) minutes")
                        .font(.orbitHeadline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(LinearGradient.orbitAccent, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Text("XP is worked out on the server from the minutes you actually spent.")
                    .font(.orbitCaption)
                    .foregroundStyle(Color.orbitInkFaint)
                    .multilineTextAlignment(.center)
            }
            .padding(22)
            .background(Color.orbitBackground)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.height(420)])
        .presentationBackground(Color.orbitBackground)
    }
}
