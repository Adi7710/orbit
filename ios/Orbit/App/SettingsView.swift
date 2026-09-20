import SwiftUI

/// Who you are, and which server this build is talking to.
///
/// Read-only where the server owns the value: the name and group come from
/// the day, the region and the voice are decided on the server, and the
/// server URL is whatever the build was pointed at. The one action is the
/// demo reset, and it is confirmed before it runs.
struct SettingsView: View {

    @State private var user: Today.User?
    @State private var confirmingReset = false
    @State private var note: String?

    private var serverURL: String {
        (Bundle.main.object(forInfoDictionaryKey: "ORBIT_API_BASE") as? String) ?? "http://localhost:3123"
    }

    var body: some View {
        NavigationStack {
            List {
                Section("You") {
                    row("Name", user?.name ?? "—")
                    row("Group", user?.group ?? "—")
                    row("This week", user.map { "\($0.xpWeek) XP · \($0.streakWeeks)-week streak" } ?? "—")
                }

                Section("Orbit") {
                    row("Region", "Jersey City → Stevens")
                    row("Voice", "George")
                    row("Server", serverURL)
                }

                Section {
                    Button("Reset demo", role: .destructive) { confirmingReset = true }
                    if let note {
                        Text(note)
                            .font(.footnote)
                            .foregroundStyle(OrbitClassic.inkSoft)
                    }
                } header: {
                    Text("Demo")
                } footer: {
                    Text("Puts the day back to its opening state: nothing completed, no proposals, normal mode. Your calibration history stays.")
                }
            }
            .navigationTitle("Settings")
            .task { user = try? await OrbitAPI.shared.today().day.user }
            .confirmationDialog("Reset the demo?", isPresented: $confirmingReset, titleVisibility: .visible) {
                Button("Reset", role: .destructive) { Task { await reset() } }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(OrbitClassic.ink)
            Spacer()
            Text(value)
                .foregroundStyle(OrbitClassic.inkSoft)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
    }

    private func reset() async {
        do {
            try await OrbitAPI.shared.resetDemo()
            note = "Reset. Pull down on Today to refresh."
        } catch {
            note = "Could not reset: \(error.localizedDescription)"
        }
    }
}
