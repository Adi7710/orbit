import SwiftUI

/// Today. The whole demo lives on this screen.
///
/// Layout notes for whoever edits this next:
///
/// - It is a `List`, not a `ScrollView` + `LazyVStack`. List is lazy in the
///   same way, and it is the only container that gives real, system-tuned
///   swipe actions. The one place a `LazyHStack` is genuinely needed is the
///   horizontal deck, and that is what the deck uses.
/// - Nothing in this file works out a time, a duration, an XP value or a
///   status. Those all arrive from `GET /api/today` already computed, which is
///   what stops the phone and the web page ever disagreeing on screen.
struct ScheduleOverviewView: View {

    @State private var store = TodayStore()
    @State private var expanded: Today.DayBlock?
    @State private var completing: Completion?
    @Namespace private var deck

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// What the Done button is asking about. Identifiable so `.sheet(item:)`
    /// rebuilds the sheet when a different task is tapped.
    struct Completion: Identifiable, Equatable {
        let id: String
        let title: String
        let estimateMinutes: Int
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                Color.orbitBackground.ignoresSafeArea()

                switch store.phase {
                case .idle, .loading:
                    ProgressView("Working out your real day")
                        .font(.orbitBody)
                        .tint(.orbitAccent)
                case .failed(let message):
                    failure(message)
                case .ready:
                    if let day = store.day { dayList(day) }
                }

                quickBar
            }
            .navigationTitle("Orbit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        }
        // A tap on a card grows it into the detail. The geometry match is
        // anchored here so both ends share one coordinate space.
        .overlay {
            if let block = expanded {
                ClassDetailView(block: block, namespace: deck) {
                    withAnimation(reduceMotion ? .none : .snappy(duration: 0.34)) { expanded = nil }
                }
                .zIndex(2)
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                XPToastView(toast: toast) {
                    withAnimation(.snappy) { store.clearToast() }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 96)
                .zIndex(3)
            }
        }
        .sensoryFeedback(.success, trigger: store.toast?.id)
        .sensoryFeedback(.impact(weight: .light), trigger: expanded?.id)
        .task { await store.refresh(showSpinner: true) }
        .task { await store.pollWhileVisible() }
        .sheet(item: $completing) { item in
            CompleteSheet(title: item.title, estimateMinutes: item.estimateMinutes) { minutes in
                Task { await store.complete(taskId: item.id, title: item.title, actualMinutes: minutes) }
            }
        }
    }

    // MARK: - The day

    @ViewBuilder
    private func dayList(_ day: Today) -> some View {
        List {
            if let banner = store.staleBanner {
                plainRow {
                    Label(banner, systemImage: "wifi.exclamationmark")
                        .font(.orbitCaption)
                        .foregroundStyle(Color.orbitUrgent)
                        .padding(.vertical, 8)
                }
            }

            plainRow {
                TimelineHeaderView(
                    user: day.user,
                    ledger: day.ledger,
                    clockText: day.transit.clockText,
                    simulatedClock: day.transit.simulated,
                    mode: day.mode
                ) { newMode in
                    Task { await store.setMode(newMode) }
                }
            }

            timelineSection(day)
            windowsSection(day)

            if let bus = day.bus {
                section("Getting there") {
                    plainRow { BusStripView(bus: bus) }
                }
            }

            questsSection(day)
            proposalsSection(day)
            friendsSection(day)

            // Room for the docked bar, so the last card is never trapped under it.
            Color.clear
                .frame(height: 76)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await store.refresh() }
    }

    /// The glanceable deck: finished, in progress, up next, later.
    @ViewBuilder
    private func timelineSection(_ day: Today) -> some View {
        if let blocks = day.blocks, !blocks.isEmpty {
            section("Your day") {
                plainRow {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: OrbitMetric.stackSpacing) {
                            ForEach(blocks) { block in
                                ClassCardView(
                                    block: block,
                                    namespace: deck,
                                    isSource: expanded?.id != block.id
                                ) {
                                    withAnimation(reduceMotion ? .none : .snappy(duration: 0.34)) {
                                        expanded = block
                                    }
                                }
                                .scrollTransition(.interactive, axis: .horizontal) { view, phase in
                                    // Opacity and scale are composited; neither
                                    // one re-lays-out the card as it slides.
                                    view.opacity(phase.isIdentity ? 1 : 0.82)
                                        .scaleEffect(phase.isIdentity ? 1 : 0.96)
                                }
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, 2)
                        .padding(.vertical, 8)
                    }
                    .scrollTargetBehavior(.viewAligned)
                    .scrollClipDisabled()
                }
            }
        }
    }

    /// The gaps, which is the part a calendar does not have.
    @ViewBuilder
    private func windowsSection(_ day: Today) -> some View {
        let windows = day.gaps.filter { !store.dismissedGapIDs.contains($0.id) }
        section("Your real windows") {
            if windows.isEmpty {
                plainRow {
                    Text(day.gaps.isEmpty ? "Nothing fits today. Enjoy it." : "You cleared the board.")
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkFaint)
                        .padding(.vertical, 10)
                }
            } else {
                ForEach(windows) { gap in
                    GapCardRow(gap: gap, domain: domain(of: gap, in: day)) { startCompleting(gap) }
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            if gap.pick != nil {
                                Button { startCompleting(gap) } label: {
                                    Label("Done", systemImage: "checkmark.circle.fill")
                                }
                                .tint(.orbitAccent)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            // Local only. No endpoint dismisses a pick, and
                            // faking one would put the phone and the web page
                            // in disagreement. Pull to refresh brings it back.
                            Button { store.dismissGap(gap.id) } label: {
                                Label("Not now", systemImage: "eye.slash")
                            }
                            .tint(.orbitInkSoft)
                        }
                }
            }
        }
    }

    @ViewBuilder
    private func questsSection(_ day: Today) -> some View {
        if !day.quests.isEmpty {
            section("Quests") {
                plainRow {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 10) {
                            ForEach(day.quests) { quest in
                                QuestChip(quest: quest)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .scrollClipDisabled()
                }
            }
        }
    }

    @ViewBuilder
    private func proposalsSection(_ day: Today) -> some View {
        let pending = day.pendingProposals
        if !pending.isEmpty {
            section("Waiting on you") {
                ForEach(pending) { item in
                    ProposalRow(proposal: item) { approve in
                        Task { await store.decide(proposalId: item.id, approve: approve) }
                    }
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            }
        }
    }

    @ViewBuilder
    private func friendsSection(_ day: Today) -> some View {
        if !day.shared.isEmpty {
            section("Free with you") {
                plainRow {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 8) {
                            ForEach(Array(day.shared.enumerated()), id: \.offset) { pair in
                                FriendChip(window: pair.element)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .scrollClipDisabled()
                }
            }
        }
    }

    // MARK: - Docked quick actions

    private var quickBar: some View {
        HStack(spacing: 12) {
            Button {
                Task { await store.planMyDay() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                    Text("Plan my day").font(.orbitHeadline)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(LinearGradient.orbitAccent, in: Capsule())
                .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .disabled(store.isWorking)

            Button {
                Task { await store.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.orbitAccent)
                    .frame(width: 50, height: 50)
                    .background(Circle().fill(Color.orbitSurface))
                    .overlay(Circle().strokeBorder(Color.orbitHairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Refresh")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        // Fixed overlay: this is where a material belongs.
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider().opacity(0.4) }
        .sensoryFeedback(.impact(weight: .light), trigger: store.isWorking)
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 30))
                .foregroundStyle(Color.orbitUrgent)
            Text(message)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInkSoft)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await store.refresh(showSpinner: true) } }
                .buttonStyle(.borderedProminent)
                .tint(.orbitAccent)
        }
        .padding(32)
    }

    // MARK: - Helpers

    /// The domain of the task the server picked for this window, used only to
    /// colour the card. Nil is fine and falls back to the accent.
    private func domain(of gap: Today.Gap, in day: Today) -> String? {
        guard let pick = gap.pick else { return nil }
        return day.tasks.first { $0.id == pick.id }?.domain
    }

    private func startCompleting(_ gap: Today.Gap) {
        guard let pick = gap.pick else { return }
        completing = Completion(id: pick.id, title: pick.title, estimateMinutes: pick.estimateMinutes)
    }

    /// A list row with the chrome turned off, so the design owns the spacing.
    private func plainRow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        Section {
            content()
        } header: {
            Text(title)
                .font(.orbitCaption)
                .foregroundStyle(Color.orbitInkFaint)
                .textCase(nil)
        }
        .listRowBackground(Color.clear)
    }
}

// MARK: - Small rows

private struct QuestChip: View {
    let quest: Today.Quest

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GradientTagView(text: "+\(quest.xp) XP", tint: .orbitUrgent, filled: true)
            Text(quest.title)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
                .lineLimit(2)
            Text("until \(quest.expiresText)")
                .font(.orbitCaption)
                .monospacedDigit()
                .foregroundStyle(Color.orbitInkFaint)
        }
        .padding(14)
        .frame(width: 190, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
    }
}

private struct FriendChip: View {
    let window: Today.SharedWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(window.names.joined(separator: ", "))
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
            Text("\(window.startText)-\(window.endText), \(window.minutes) min")
                .font(.orbitCaption)
                .monospacedDigit()
                .foregroundStyle(Color.orbitInkFaint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Capsule().fill(Color.orbitSurface))
        .overlay(Capsule().strokeBorder(Color.orbitHairline, lineWidth: 1))
    }
}

/// One thing the agent proposed, with the reason it gave. The agent proposes;
/// approving is what makes it real, and that happens on the server.
private struct ProposalRow: View {
    let proposal: Today.Proposal
    let onDecide: (Bool) -> Void

    private var kindLabel: String {
        proposal.proposal.kind.replacingOccurrences(of: "_", with: " ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GradientTagView(text: kindLabel, tint: .orbitLive)
            Text(proposal.proposal.reason)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
                .fixedSize(horizontal: false, vertical: true)

            if let draft = proposal.proposal.body {
                Text(draft)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color.orbitInkSoft)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.orbitHairline))
            }

            HStack(spacing: 10) {
                Button("Approve") { onDecide(true) }
                    .buttonStyle(.borderedProminent)
                    .tint(.orbitAccent)
                Button("Decline") { onDecide(false) }
                    .buttonStyle(.bordered)
                    .tint(.orbitInkSoft)
            }
            .font(.orbitCaption)
            .buttonBorderShape(.capsule)
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(Color.orbitLive.opacity(0.28), lineWidth: 1)
                )
        }
    }
}
