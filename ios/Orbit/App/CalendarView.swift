import SwiftUI

/// The timetable, and where it comes from.
///
/// Two things and no more: today's fixed blocks in time order, exactly as the
/// server sent them, and the import form that feeds them -- a timetable .ics
/// link and the Canvas calendar feed. The Canvas link is a credential. It is
/// posted to the server once and cleared from the field; nothing on the phone
/// keeps it.
struct CalendarView: View {

    @State private var day: Today?
    @State private var loadError: String?
    @State private var timetableUrl = ""
    @State private var canvasUrl = ""
    @State private var importing = false
    @State private var importNote: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let blocks = day?.blocks, !blocks.isEmpty {
                        ForEach(blocks) { block in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text("\(block.startText)–\(block.endText)")
                                    .font(.system(.subheadline, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(OrbitClassic.inkSoft)
                                    .frame(width: 100, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(block.title)
                                        .font(.body)
                                        .foregroundStyle(OrbitClassic.ink)
                                    if let place = block.place {
                                        Text(place)
                                            .font(.caption)
                                            .foregroundStyle(OrbitClassic.inkFaint)
                                    }
                                }
                                Spacer(minLength: 0)
                                Text(statusWord(block.status))
                                    .orbitEyebrow()
                                    .foregroundStyle(OrbitClassic.inkFaint)
                            }
                            .padding(.vertical, 2)
                        }
                    } else if let loadError {
                        Text(loadError)
                            .font(.footnote)
                            .foregroundStyle(Color.orbitUrgent)
                    } else {
                        Text("No classes today.")
                            .foregroundStyle(OrbitClassic.inkSoft)
                    }
                } header: {
                    Text("Today")
                }

                Section {
                    TextField("Timetable .ics link", text: $timetableUrl)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    TextField("Canvas calendar feed link", text: $canvasUrl)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button {
                        Task { await runImport() }
                    } label: {
                        HStack {
                            Text(importing ? "Importing…" : "Import")
                            if importing {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(importing || (trimmed(timetableUrl).isEmpty && trimmed(canvasUrl).isEmpty))
                    if let importNote {
                        Text(importNote)
                            .font(.footnote)
                            .foregroundStyle(OrbitClassic.inkSoft)
                    }
                } header: {
                    Text("Import")
                } footer: {
                    Text("The Canvas feed link is a credential. It is sent to the server once and never kept on the phone.")
                }
            }
            .navigationTitle("Calendar")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    // MARK: - Helpers

    private func trimmed(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func statusWord(_ status: Today.DayBlock.Status) -> String {
        switch status {
        case .now: return "now"
        case .next: return "next"
        case .done: return "done"
        case .later: return ""
        }
    }

    private func load() async {
        do {
            day = try await OrbitAPI.shared.today().day
            loadError = nil
        } catch {
            loadError = "Orbit can't reach the server."
        }
    }

    private func runImport() async {
        importing = true
        defer { importing = false }
        do {
            let result = try await OrbitAPI.shared.importCalendars(timetableUrl: timetableUrl, canvasUrl: canvasUrl)
            importNote = result.summary
            // The credential does not linger in the field once it has been used.
            canvasUrl = ""
            await load()
        } catch {
            importNote = "Import failed: \(error.localizedDescription)"
        }
    }
}
