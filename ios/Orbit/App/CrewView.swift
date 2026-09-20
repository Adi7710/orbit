import SwiftUI

/// The crew: your friends, this week, ranked.
///
/// Competitive by distance, never by shame. The screen leads with where you
/// stand and the two gaps that make it a race -- who is just ahead and by
/// how much, who is just behind and by how much -- and then the board, every
/// row with a bar against the leader so the whole race is visible at a
/// glance. What it does not do is the thing docs/theme.md section 2.4
/// forbids: nobody at the bottom is dimmed, greyed or coloured for it. Being
/// behind is a number to close.
///
/// Every number is the server's. The phone chooses type and colour.
struct CrewView: View {

    @State private var crew: Crew?
    @State private var loadError: String?
    @State private var group: String? = nil
    @State private var loading = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ZStack {
                Color.orbitBackground.ignoresSafeArea()

                if let crew {
                    List {
                        plainRow { standing(crew) }
                        if crew.groups.count > 1 {
                            plainRow { groupPicker(crew.groups) }
                        }
                        Section {
                            ForEach(Array(crew.rows.enumerated()), id: \.element.id) { pair in
                                plainRow {
                                    CrewRow(row: pair.element, isMe: pair.element.rank == crew.me?.rank && crew.me != nil, reduceMotion: reduceMotion)
                                        .orbitAppear(pair.offset)
                                }
                            }
                        } header: {
                            Text(group ?? "Everyone")
                                .orbitEyebrow()
                                .foregroundStyle(OrbitClassic.inkFaint)
                        }
                        Color.clear.frame(height: 40).listRowBackground(Color.clear).listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .refreshable { await load() }
                } else if let loadError {
                    VStack(spacing: 10) {
                        Text("No signal").font(.orbitTitle).foregroundStyle(Color.orbitInk)
                        Text(loadError).font(.orbitBody).foregroundStyle(Color.orbitInkSoft)
                        Button("Try again") { Task { await load() } }
                    }
                } else {
                    ProgressView().tint(.orbitAccentInk)
                }
            }
            .navigationTitle("Crew")
            .task { await load() }
            .onChange(of: group) { Task { await load() } }
        }
    }

    // MARK: - Standing

    /// Where you are, and the race either side of you. Three lines, no more.
    private func standing(_ crew: Crew) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("This week")
                .orbitEyebrow()
                .foregroundStyle(OrbitClassic.inkFaint)

            if let me = crew.me {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("#\(me.rank)")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitAccentInk)
                        .contentTransition(.numericText())
                    Text("of \(me.total)")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(OrbitClassic.inkSoft)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(me.xpWeek)")
                            .font(.system(size: 24, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(OrbitClassic.ink)
                            .contentTransition(.numericText())
                        Text("XP")
                            .orbitEyebrow()
                            .foregroundStyle(OrbitClassic.inkFaint)
                    }
                }

                // The race. docs/copy.md crew.standing.*: a distance, said once.
                if let ahead = me.ahead {
                    raceLine(icon: "arrow.up", text: ahead.byXp == 0 ? "Level with \(ahead.name). Rings and streak decide it." : "\(ahead.byXp) XP behind \(ahead.name)")
                } else {
                    raceLine(icon: "crown", text: me.behind.map { "You lead. \($0.name) is \($0.byXp) XP back." } ?? "You lead.")
                }
                if let behind = me.behind, me.ahead != nil {
                    raceLine(icon: "arrow.down", text: "\(behind.byXp) XP ahead of \(behind.name)")
                }
            } else {
                Text("You are not on this board yet.")
                    .font(.orbitBody)
                    .foregroundStyle(OrbitClassic.inkSoft)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(OrbitClassic.surface)
        )
        .padding(.top, 4)
    }

    private func raceLine(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.orbitAccentInk)
                .frame(width: 16)
            Text(text)
                .font(.orbitBody)
                .foregroundStyle(OrbitClassic.ink)
                .monospacedDigit()
        }
    }

    // MARK: - Groups

    private func groupPicker(_ groups: [String]) -> some View {
        Picker("Group", selection: $group) {
            Text("Everyone").tag(String?.none)
            ForEach(groups, id: \.self) { g in
                Text(g).tag(String?.some(g))
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: - Load

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            crew = try await OrbitAPI.shared.crew(group: group)
            loadError = nil
        } catch {
            loadError = "Orbit can't reach the server."
        }
    }

    private func plainRow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}

// MARK: - Row

/// docs/theme.md section 7, crew row: rank, name, meta, a bar against the
/// leader, the value right-aligned with its unit beneath. Your own row gets
/// the accent mixed lightly into the surface -- a tint, never a border. First
/// place gets the crown. Nobody gets anything for being last.
private struct CrewRow: View {
    let row: Crew.Row
    let isMe: Bool
    let reduceMotion: Bool

    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(row.rank)")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(row.rank == 1 ? Color.orbitAccentInk : OrbitClassic.inkFaint)
                    .frame(width: 26, alignment: .leading)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(row.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(OrbitClassic.ink)
                        if row.rank == 1 {
                            Image(systemName: "crown.fill")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color.orbitAccentInk)
                                .accessibilityLabel("leading")
                        }
                        if isMe {
                            Text("you")
                                .orbitEyebrow()
                                .foregroundStyle(Color.orbitOnAccent)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(Capsule().fill(Color.orbitAccent))
                        }
                    }
                    Text("\(row.streakWeeks)-week streak · \(row.ringsClosed) rings")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(OrbitClassic.inkFaint)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(row.xpWeek)")
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(OrbitClassic.ink)
                        .contentTransition(.numericText())
                    Text("XP")
                        .orbitEyebrow()
                        .foregroundStyle(OrbitClassic.inkFaint)
                }
            }

            // The bar: this row against the leader. Sweeps in once, on appear.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(OrbitClassic.surfaceDeep)
                    Capsule()
                        .fill(Color.orbitAccent)
                        .frame(width: max(3, geo.size.width * (revealed || reduceMotion ? row.share : 0)))
                }
            }
            .frame(height: 3)
            .padding(.leading, 38)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isMe ? Color.orbitAccent.opacity(0.08) : OrbitClassic.surface)
        )
        .onAppear {
            guard !revealed else { return }
            withAnimation(OrbitMotion.sweep(reduceMotion)) { revealed = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(row.rank). \(row.name), \(row.xpWeek) XP this week, \(row.streakWeeks) week streak, \(row.ringsClosed) rings closed\(isMe ? ", you" : "")")
    }
}
