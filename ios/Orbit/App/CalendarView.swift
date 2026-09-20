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
    @State private var scope: Scope = .today

    enum Scope: String, CaseIterable, Identifiable {
        case today = "Today", week = "This week"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            Group {
                switch scope {
                case .today: todayList
                case .week: weekList
                }
            }
            .safeAreaInset(edge: .top) {
                Picker("", selection: $scope) {
                    ForEach(Scope.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .background(OrbitClassic.ground)
            }
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
            .refreshable { await load() }
        }
    }

    // MARK: - Today

    private var todayList: some View {
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
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(OrbitClassic.ground.ignoresSafeArea())
    }

    // MARK: - This week

    /// Everything with a deadline, in the buckets the *server* put them in.
    ///
    /// `tasks[].bucket` and `tasks[].dueText` are both written server-side, so
    /// nothing here works out which day a deadline falls on or how to say it.
    /// That is the only reason this tab exists: until those two fields
    /// arrived, a week view meant date arithmetic on the phone.
    private var weekList: some View {
        List {
            let tasks = day?.tasks ?? []
            if tasks.isEmpty {
                Text(loadError ?? "Nothing with a deadline.")
                    .foregroundStyle(loadError == nil ? OrbitClassic.inkSoft : Color.orbitUrgent)
            } else {
                ForEach(Self.bucketOrder, id: \.key) { bucket in
                    let inBucket = tasks.filter { ($0.bucket ?? "later") == bucket.key }
                    if !inBucket.isEmpty {
                        Section {
                            ForEach(inBucket) { task in
                                HStack(alignment: .firstTextBaseline, spacing: 12) {
                                    Circle()
                                        .fill(Color.orbitDomain(task.domain))
                                        .frame(width: 8, height: 8)
                                        .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(task.title)
                                            .font(.body)
                                            .foregroundStyle(OrbitClassic.ink)
                                        HStack(spacing: 6) {
                                            if let code = task.courseCode {
                                                Text(code)
                                                    .font(.caption.weight(.semibold))
                                                    .foregroundStyle(Color.orbitDomain(task.domain))
                                            }
                                            if let due = task.dueText {
                                                Text(due)
                                                    .font(.caption)
                                                    .foregroundStyle(OrbitClassic.inkFaint)
                                            }
                                        }
                                    }
                                    Spacer(minLength: 8)
                                    Text("\(task.planningMinutes)m")
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundStyle(OrbitClassic.inkSoft)
                                }
                                .padding(.vertical, 3)
                            }
                        } header: {
                            Text(bucket.label)
                                .foregroundStyle(bucket.key == "overdue" ? Color.orbitUrgent : OrbitClassic.inkSoft)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(OrbitClassic.ground.ignoresSafeArea())
    }

    /// Reading order: what slipped, then what is due now, then what is coming.
    /// Sorting by date alone buries today under everything already missed.
    private static let bucketOrder: [(key: String, label: String)] = [
        ("overdue", "Overdue"),
        ("today", "Due today"),
        ("soon", "Coming up"),
        ("later", "Later"),
        ("undated", "No deadline")
    ]

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
