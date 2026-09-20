import SwiftUI

/// Today. The whole demo lives on this screen.
///
/// Notes for whoever edits this next:
///
/// - It is a `List`, not a `ScrollView` + `LazyVStack`. List is lazy in the
///   same way, and it is the only container that gives real, system-tuned
///   swipe actions. The one place a `LazyHStack` is genuinely needed is the
///   horizontal deck, and that is what the deck uses.
/// - Nothing in this file works out a time, a duration, an XP value or a
///   status. Those arrive from `GET /api/today` already computed, which is
///   what stops the phone and the web page ever disagreeing on screen.
/// - The accent budget: lime appears on the class that is happening now, on
///   the selected mode chip, and on the primary action in the docked bar.
///   Nowhere else. If you are adding a fourth, something else has to give it
///   up.
struct ScheduleOverviewView: View {

    /// Reported upward so the tab bar can wear the mode's accent too. Today
    /// is the only screen that knows the mode, and the tab bar is the one
    /// piece of chrome that outlives it, so it is told rather than asking.
    /// Defaulted, so a preview or a test can build this view on its own.
    @Binding private var appMode: Today.Mode

    init(appMode: Binding<Today.Mode> = .constant(.normal)) {
        self._appMode = appMode
    }

    @State private var store = TodayStore()
    @State private var voice = VoiceSession()
    @State private var expanded: Today.DayBlock?
    @State private var completing: Completion?
    @State private var showingVoice = false
    @State private var showingLedger = false
    @State private var openDoor: DoorID?
    @State private var showingPlan = false
    @Namespace private var deck

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    /// The mode's accent, shape and pace. The dock reads this too, so Crisis
    /// and Chill never put two accents on one screen: the header segment and
    /// the primary action are the same instrument.
    private var chrome: OrbitModeChrome {
        .on(store.day?.mode ?? .normal, reduceMotion: reduceMotion)
    }

    /// The six doors on Today. Each opens a half sheet rather than pushing a
    /// page: the ledger behind it stays on screen, which is the whole reason
    /// the detail was moved off the home screen in the first place.
    enum DoorID: String, Identifiable, CaseIterable {
        case day, windows, bus, quests, proposals, friends
        var id: String { rawValue }
    }

    /// What the Done button is asking about. Identifiable so `.sheet(item:)`
    /// rebuilds the sheet when a different task is tapped.
    struct Completion: Identifiable, Equatable {
        let id: String
        let title: String
        let estimateMinutes: Int
    }

    var body: some View {
        // A NavigationStack so the six doors on Today can push their pages.
        // The root keeps its own top gradient and no bar; pushed pages get the
        // system bar with a back button.
        NavigationStack {
        ZStack(alignment: .bottom) {
            Color.orbitBackground.ignoresSafeArea()
            // The mode, said by the page and not only by the chip.
            chrome.wash.ignoresSafeArea().animation(chrome.animation, value: store.day?.mode)

            switch store.phase {
            case .idle, .loading:
                ProgressView()
                    .tint(.orbitAccentInk)
            case .failed(let message):
                failure(message)
            case .ready:
                if let day = store.day { dayList(day) }
            }

            dock
        }
        // A tap on a tile grows it into the detail; the geometry match is
        // anchored here so both ends share one coordinate space.
        // The List runs to the physical top edge — there is no nav bar — so the
        // day scrolled under the clock and the battery with nothing behind it.
        // An opaque gradient rather than a material: this is a third fixed
        // surface and PERFORMANCE.md budgets exactly two blurs, both of which
        // are spent. A gradient fill is one blend and never re-samples.
        // Declared before the other overlays so the detail view and the toast
        // still sit above it.
        .overlay(alignment: .top) {
            LinearGradient(
                stops: [
                    .init(color: .orbitBackground, location: 0),
                    .init(color: .orbitBackground, location: 0.62),
                    .init(color: Color.orbitBackground.opacity(0), location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 78)
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
        }
        // The pulse: one scripted notice at a time, above the day, every
        // twenty seconds, from /api/pulse. Sits over the top gradient and
        // under the detail view and the toast.
        .overlay(alignment: .top) {
            PulseBanner()
                .zIndex(1)
        }
        .overlay {
            if let block = expanded {
                ClassDetailView(block: block, namespace: deck) {
                    withAnimation(OrbitMotion.hero(reduceMotion)) { expanded = nil }
                }
                .zIndex(2)
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = store.toast {
                XPToastView(toast: toast) {
                    withAnimation(OrbitMotion.entrance(reduceMotion)) { store.clearToast() }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 104)
                .zIndex(3)
            }
        }
        .animation(OrbitMotion.entrance(reduceMotion), value: store.toast?.id)
        .sensoryFeedback(.success, trigger: store.toast?.id)
        .sensoryFeedback(.impact(weight: .light), trigger: expanded?.id)
        .task {
            // Whatever the agent did by voice landed on the server. Reload the
            // day so it changes on screen while Orbit is still speaking — the
            // sheet is short for exactly this reason.
            voice.onAgentActed = { Task { await store.refresh() } }
            await store.refresh(showSpinner: true)
        }
        .task { await store.pollWhileVisible() }
        // A call that backgrounds mid-hold must not come back still listening.
        .onChange(of: store.day?.mode) { _, newMode in
            if let newMode { appMode = newMode }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { voice.closeMicForBackground() }
        }
        .sheet(isPresented: $showingLedger) {
            if let day = store.day {
                LedgerSheet(ledger: day.ledger, cuts: day.cuts ?? [])
                    .presentationDetents([.fraction(0.62), .large])
                    .presentationDragIndicator(.visible)
            }
        }
        .sheet(isPresented: $showingPlan) {
            if let day = store.day {
                PlanSheet(config: day.modeConfig,
                          plan: store.lastPlan,
                          isWorking: store.isWorking,
                          accent: chrome.accent,
                          onAccent: chrome.onAccent)
                    .presentationDetents([.fraction(0.62), .large])
                    .presentationDragIndicator(.visible)
            }
        }
        .sheet(item: $openDoor) { which in
            doorSheet(which)
        }
        .sheet(isPresented: $showingVoice) {
            VoiceSheetView(session: voice) { showingVoice = false }
        }
        .sheet(item: $completing) { item in
            CompleteSheet(title: item.title, estimateMinutes: item.estimateMinutes) { minutes in
                Task { await store.complete(taskId: item.id, title: item.title, actualMinutes: minutes) }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        }
    }

    // MARK: - The day

    @ViewBuilder
    private func dayList(_ day: Today) -> some View {
        List {
            if let banner = store.staleBanner {
                plainRow {
                    Text(banner)
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitUrgent)
                        .padding(.vertical, 6)
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
                // A notification banner drops over the top of the screen and
                // was landing on the student's own name. The header starts
                // below where a banner ends.
                .padding(.top, 46)
            }

            // Plan my day sits directly under the three modes. What the mode
            // promises and the laws it plans by moved into the sheet this
            // button opens: they describe the plan, so they belong with it
            // rather than on a home screen that is meant to be glanceable.
            plainRow { planButton }
            plainRow { fitsCard(day) }
            deadlinesSection(day)
            atRiskSection(day)

            // Six doors, not six sections. Each row says one line about what
            // is behind it and opens a page with all of it. The home screen
            // is the ledger and the way in; the detail lives one tap away,
            // which is the same rule the fits card already follows.
            section("Today") {
                door(.day, "Your day", detail: dayDetail(day), icon: "calendar.day.timeline.left")
                door(.windows, "Your real windows", detail: windowsDetail(day), icon: "rectangle.split.3x1")
                door(.bus, "Getting there", detail: busDetail(day), icon: "tram")
                door(.quests, "Quests", detail: questsDetail(day), icon: "star")
                door(.proposals, "Waiting on you", detail: proposalsDetail(day), icon: "checkmark.circle")
                door(.friends, "Free with you", detail: friendsDetail(day), icon: "person.2")
            }

            learnedSection(day)

            // Room for the dock and the tab bar under it.
            Color.clear
                .frame(height: 140)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await store.refresh() }
    }

    /// Plan my day. Full width, in the mode's accent, directly under the
    /// rings and the mode bar. The one action on the screen.
    private var planButton: some View {
        Button {
            showingPlan = true
            Task { await store.planMyDay() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                Text(store.isWorking ? "Thinking…" : "Plan my day")
                    .font(.orbitHeadline)
            }
            .foregroundStyle(chrome.onAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(chrome.accent, in: Capsule())
        }
        .buttonStyle(.orbitTile)
        .disabled(store.isWorking)
        .orbitBloom(chrome.accent, active: !store.isWorking, radius: 18)
        .animation(chrome.animation, value: store.day?.mode)
        .padding(.top, 4)
    }

    // MARK: - Doors

    /// A row that opens a page. The page is the section it used to be, in its
    /// own List, under its own title.
    private func door(_ id: DoorID, _ title: String, detail: String, icon: String) -> some View {
        plainRow {
            Button {
                openDoor = id
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(chrome.accent)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(OrbitClassic.ink)
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(OrbitClassic.inkSoft)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(OrbitClassic.inkFaint)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(OrbitClassic.surface)
                )
            }
            .buttonStyle(.plain)
        }
    }

    /// A door's contents at half height. No navigation bar: each section
    /// already writes its own heading, and a title bar on top of that says
    /// the same word twice.
    @ViewBuilder
    private func doorSheet(_ which: DoorID) -> some View {
        Group {
            if let day = store.day, which == .friends {
                FriendsWalletView(windows: day.shared, accent: chrome.accent)
            } else if let day = store.day {
                List {
                    switch which {
                    case .day: timelineSection(day)
                    case .windows: windowsSection(day)
                    case .bus: busSection(day)
                    case .quests: questsSection(day)
                    case .proposals: proposalsSection(day)
                    case .friends: EmptyView()
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color.orbitBackground.ignoresSafeArea())
        .presentationDetents([detent(for: which), .large])
        .presentationDragIndicator(.visible)
    }

    /// How tall a door opens: what its rows actually need, clamped so a door
    /// with one line is not a full-screen sheet and a door with nine is not a
    /// letterbox you have to scroll from the first row. Drag up for the rest.
    ///
    /// Counted rather than measured. A `List` is lazy, so asking it how tall
    /// it is gives the height of what has been built so far, which is a
    /// different number on every open.
    private func detent(for which: DoorID) -> PresentationDetent {
        guard let day = store.day else { return .medium }
        let rows: Int
        let perRow: CGFloat
        switch which {
        case .day:
            rows = (day.blocks ?? []).count
            perRow = 188            // a class card
        case .windows:
            rows = max(1, day.gaps.count)
            perRow = 132            // a gap card, plus its work-block note
        case .bus:
            rows = 1
            perRow = 150
        case .quests:
            rows = 1
            perRow = 140            // one horizontal rail
        case .proposals:
            rows = max(1, day.pendingProposals.count)
            perRow = 132
        case .friends:
            // The wallet is the content: a card in full plus the stack under
            // it, so it wants most of the screen rather than a row count.
            return .fraction(0.78)
        }
        return .height(min(max(96 + CGFloat(rows) * perRow, 240), 720))
    }

    // One line per door, from server fields only. Counts of things are the
    // only numbers the phone writes here.

    private func dayDetail(_ day: Today) -> String {
        let blocks = day.blocks ?? []
        if let next = blocks.first(where: { $0.status == .next }) { return "\(blocks.count) on the timetable · next \(next.title) at \(next.startText)" }
        if let now = blocks.first(where: { $0.status == .now }) { return "Now: \(now.title) until \(now.endText)" }
        return blocks.isEmpty ? "No classes today" : "\(blocks.count) on the timetable, all done"
    }

    private func windowsDetail(_ day: Today) -> String {
        if day.gaps.isEmpty { return "Nothing fits. Enjoy it." }
        return day.gaps.map { "\($0.startText)–\($0.endText)" }.joined(separator: " · ")
    }

    private func busDetail(_ day: Today) -> String {
        if let bus = day.bus { return "Leave by \(bus.leaveByText) for the \(bus.route)" }
        return day.transit.why ?? "Nothing to catch"
    }

    private func questsDetail(_ day: Today) -> String {
        day.quests.isEmpty ? "None today" : "\(day.quests.count) today"
    }

    private func proposalsDetail(_ day: Today) -> String {
        let n = day.pendingProposals.count
        return n == 0 ? "Nothing waiting" : "\(n) to decide"
    }

    private func friendsDetail(_ day: Today) -> String {
        day.shared.isEmpty ? "Nobody free in your windows" : day.shared.flatMap(\.names).joined(separator: ", ")
    }

    /// The whole ledger reduced to the two lines that change behaviour.
    /// Everything else is one tap away, which is the point: the first glance
    /// stays readable.
    private func fitsCard(_ day: Today) -> some View {
        Button {
            showingLedger = true
        } label: {
            // When the mode asks for it, this answers the harder question:
            // not "does today's list fit in today" but "does the work due by
            // each deadline fit in the windows before it". Chill never asks,
            // Normal asks only once the day has stopped fitting, Crisis always.
            let feas = day.feasibility
            let showMeter = (day.modeConfig?.showsFeasibility(shortfallMin: feas?.shortfallMin ?? 0) ?? false) && feas != nil

            return VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    // docs/copy.md today.ledger.over / today.ledger.tight,
                    // unless the mode has asked for the meter, in which case
                    // the sentence the server wrote about capacity wins.
                    Text(showMeter ? feas!.message
                         : day.ledger.overCommitted
                         ? "You're over by \(OrbitDuration.hm(day.ledger.slack)). Something has to move."
                         : "You have \(OrbitDuration.hm(day.ledger.slack)) of slack today.")
                        .font(.headline)
                        .foregroundStyle(OrbitClassic.ink)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2)
                        .foregroundStyle(OrbitClassic.inkFaint)
                }
                // One line for both states -- copy rule 6 puts the number
                // first and stops there -- with the need-versus-have counts
                // in its place when the meter is on.
                Text(showMeter
                     ? "\(feas!.needMin) min of work against \(feas!.haveMin) min of windows."
                     : "After \(OrbitDuration.hm(day.ledger.frictionMinutes)) of walking, eating and getting ready.")
                    .font(.subheadline)
                    .foregroundStyle(OrbitClassic.inkSoft)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(OrbitClassic.surface)
            )
        }
        .buttonStyle(.plain)
    }

    /// Deadlines the work no longer fits in front of. Renders nothing when
    /// the list is empty: an "all clear" card is a card you have to read to
    /// find out it had nothing to say.
    /// Deadlines, in the shape the mode asks for. Crisis stacks them
    /// tightest-first because that is the day; Normal keeps them to a card;
    /// Chill says one line and gets out of the way.
    @ViewBuilder
    private func deadlinesSection(_ day: Today) -> some View {
        if let cfg = day.modeConfig, let due = day.deadlines, !due.isEmpty {
            if cfg.deadlineMode == "quiet-line" {
                plainRow {
                    Text("\(due.count) thing\(due.count == 1 ? "" : "s") due in the next three days. Nothing is on fire.")
                        .font(.subheadline)
                        .foregroundStyle(OrbitClassic.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 4)
                }
            } else {
                section(cfg.deadlineMode == "drive-day" ? "What is due, tightest first" : "Due soon") {
                    ForEach(due) { d in
                        let verdict = day.feasibility?.deadlines.first { $0.id == d.id }
                        plainRow {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(d.title)
                                        .font(.orbitBody)
                                        .foregroundStyle(Color.orbitInk)
                                        .fixedSize(horizontal: false, vertical: true)
                                    if let code = d.courseCode {
                                        Text(code).orbitEyebrow().foregroundStyle(Color.orbitInkFaint)
                                    }
                                }
                                Spacer(minLength: 8)
                                Text(verdict?.fits == false
                                     ? "\(abs(verdict!.slackMin))m short"
                                     : "\(d.remainingEffortMin)m · \(d.dueText)")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(verdict?.fits == false || d.overdue ? Color.orbitUrgent : Color.orbitInkFaint)
                            }
                            .padding(.vertical, 3)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func atRiskSection(_ day: Today) -> some View {
        if let atRisk = day.atRisk, !atRisk.isEmpty {
            section("At risk") {
                ForEach(atRisk) { task in
                    plainRow {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(task.title)
                                .font(.orbitBody)
                                .foregroundStyle(Color.orbitInk)
                            Spacer(minLength: 8)
                            // Not red: the deadline is the student's, and the
                            // number is the message. theme.md section 2.4.
                            Text("needs \(task.needsMinutes)m")
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(Color.orbitInkSoft)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
    }

    /// The weekly review, in its own words. Empty until an aspect has earned
    /// the right to speak, and silent until then.
    /// In Crisis there is no template quest in a window -- the deadlines put
    /// real work there instead, and the window has to say which.
    @ViewBuilder
    private func workBlockNote(_ day: Today, gapId: String) -> some View {
        let blocks = (day.workBlocks ?? []).filter { $0.gapId == gapId }
        if !blocks.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(blocks) { b in
                    Text("\(b.title) · \(b.minutes)m\(b.completes ? " · finishes it" : "")")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }
            .padding(.leading, 14)
            .padding(.bottom, 2)
            .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private func learnedSection(_ day: Today) -> some View {
        if let learned = day.learned, !learned.isEmpty {
            section("What Orbit has learned") {
                ForEach(learned) { fact in
                    plainRow {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(fact.label)
                                .orbitEyebrow()
                                .foregroundStyle(Color.orbitInkFaint)
                            Text(fact.sentence)
                                .font(.orbitBody)
                                .foregroundStyle(Color.orbitInkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
    }

    /// "Getting there" has two shapes. With a departure it is `BusStripView`.
    /// Without one the server still says why — "Nothing to catch yet…" — and
    /// that sentence is the card. An absent bus is not an absent section: the
    /// student asked the same question either way and deserves the same
    /// answer. Rendered only when there is something to say, so the header
    /// never stands over nothing.
    @ViewBuilder
    private func busSection(_ day: Today) -> some View {
        if let bus = day.bus {
            section("Getting there") {
                plainRow { BusStripView(bus: bus) }
            }
        } else if let why = day.transit.why, !why.isEmpty {
            section("Getting there") {
                plainRow {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(why)
                            .font(.orbitBody)
                            .foregroundStyle(Color.orbitInkSoft)
                            .fixedSize(horizontal: false, vertical: true)

                        if let next = day.transit.nextClass {
                            Text("\(next.title) · \(next.startText)")
                                .orbitEyebrow()
                                .foregroundStyle(Color.orbitInkFaint)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    /// The glanceable deck: finished, in progress, up next, later.
    @ViewBuilder
    private func timelineSection(_ day: Today) -> some View {
        if let blocks = day.blocks, !blocks.isEmpty {
            section("Your day") {
                // Stacked, not a deck. A sideways rail hides most of the day
                // behind a swipe; the whole timetable should be readable at
                // once now that it lives in a sheet of its own.
                ForEach(Array(blocks.enumerated()), id: \.element.id) { pair in
                    ClassCardView(
                        block: pair.element,
                        stacked: true,
                        namespace: deck,
                        isSource: expanded?.id != pair.element.id,
                        index: pair.offset
                    ) {
                        withAnimation(OrbitMotion.hero(reduceMotion)) {
                            expanded = pair.element
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
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
                    Text(day.gaps.isEmpty ? "Nothing fits. Enjoy it." : "You cleared the board.")
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkFaint)
                        .padding(.vertical, 10)
                }
            } else {
                ForEach(Array(windows.enumerated()), id: \.element.id) { pair in
                    // The work-block note used to be an .overlay, which
                    // reserves no space and so printed itself on top of the
                    // card's own text. It is part of the row now.
                    VStack(alignment: .leading, spacing: 6) {
                        GapCardRow(
                            gap: pair.element,
                            domain: domain(of: pair.element, in: day),
                            index: pair.offset
                        ) { startCompleting(pair.element) }
                        workBlockNote(day, gapId: pair.element.id)
                    }
                        .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            if pair.element.pick != nil {
                                Button { startCompleting(pair.element) } label: {
                                    Label("Done", systemImage: "checkmark")
                                }
                                .tint(.orbitAccentInk)
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            // Local only. No endpoint dismisses a pick, and
                            // faking one would put the phone and the web page
                            // in disagreement. Pull to refresh brings it back.
                            Button { store.dismissGap(pair.element.id) } label: {
                                Label("Not now", systemImage: "eye.slash")
                            }
                            .tint(.orbitInkFaint)
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
                            ForEach(Array(day.quests.enumerated()), id: \.element.id) { pair in
                                QuestChip(quest: pair.element).orbitAppear(pair.offset)
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
                ForEach(Array(pending.enumerated()), id: \.element.id) { pair in
                    ProposalRow(proposal: pair.element) { approve in
                        Task { await store.decide(proposalId: pair.element.id, approve: approve) }
                    }
                    .orbitAppear(pair.offset)
                    .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
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
                                FriendChip(window: pair.element).orbitAppear(pair.offset)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .scrollClipDisabled()
                }
            }
        }
    }

    // MARK: - The dock

    /// The dock is the voice now, and only the voice: Plan my day moved up
    /// under the rings. One round button, bottom right, on the second of the
    /// two materials this screen is allowed.
    private var dock: some View {
        HStack {
            Spacer()
            Button {
                showingVoice = true
            } label: {
                Image(systemName: "mic.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(chrome.onAccent)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(chrome.accent))
                    .overlay(Circle().strokeBorder(Color.orbitHairline, lineWidth: 1))
            }
            .buttonStyle(.orbitTile)
            .orbitBloom(chrome.accent, radius: 18)
            .accessibilityLabel("Talk to Orbit")
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 16) {
            Text("No signal")
                .font(.orbitTitle)
                .orbitTightDisplay()
                .foregroundStyle(Color.orbitInk)
            Text(message)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInkSoft)
                .multilineTextAlignment(.center)
            Button {
                Task { await store.refresh(showSpinner: true) }
            } label: {
                Text("Try again")
                    .font(.orbitHeadline)
                    .foregroundStyle(Color.orbitOnAccent)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 13)
                    .background(Capsule().fill(Color.orbitAccent))
            }
            .buttonStyle(.orbitTile)
        }
        .padding(32)
    }

    // MARK: - Helpers

    /// The domain of the task the server picked for this window, used only to
    /// colour the spine. Nil is fine.
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

    /// A titled group.
    ///
    /// The title is an ordinary row, not a `Section` header, and that is the
    /// whole point. A plain `List` pins its headers, and these are transparent
    /// — `listRowBackground(Color.clear)` is what lets the design own the
    /// spacing — so a pinned one does not hide what scrolls beneath it, it
    /// sits *on top of it*. "YOUR REAL WINDOWS" ended up printed over the first
    /// card in the section. Giving the header an opaque plate would fix the
    /// collision and give us a sticky grey bar the design does not want; these
    /// are eyebrow labels, not navigation, so they should scroll away with
    /// their content.
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        Section {
            plainRow {
                Text(title)
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitInkFaint)
                    .padding(.top, 10)
            }
            content()
        }
    }
}

// MARK: - Small rows

private struct QuestChip: View {
    let quest: Today.Quest

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("+\(quest.xp) XP")
                .orbitEyebrow()
                .foregroundStyle(Color.orbitAccentInk)
            Text(quest.title)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
                .lineLimit(2)
            Spacer(minLength: 0)
            Text("until \(quest.expiresText)")
                .orbitEyebrow()
                .monospacedDigit()
                .foregroundStyle(Color.orbitInkFaint)
        }
        .padding(15)
        .frame(width: 186, height: 118, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.chipRadius, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.chipRadius, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
    }
}

private struct FriendChip: View {
    let window: Today.SharedWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(window.names.joined(separator: ", "))
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
            Text("\(window.startText)–\(window.endText), \(window.minutes) min")
                .orbitEyebrow()
                .monospacedDigit()
                .foregroundStyle(Color.orbitInkFaint)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
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
        VStack(alignment: .leading, spacing: 12) {
            Text(kindLabel)
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)
            Text(proposal.proposal.reason)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInk)
                .fixedSize(horizontal: false, vertical: true)

            if let draft = proposal.proposal.body {
                Text(draft)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Color.orbitInkSoft)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.orbitSurfaceInset)
                    )
            }

            HStack(spacing: 10) {
                // Outlined, not filled. A lime fill here is a fourth lime on
                // Today — and worse, one per pending proposal, so the accent
                // multiplies with the agent's output. This is the treatment
                // GapCardRow's Done button already uses for the same reason:
                // accent as ink and stroke carries the primary action without
                // spending the fill.
                Button { onDecide(true) } label: {
                    Text("Approve")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitAccentInk)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Capsule().strokeBorder(Color.orbitAccentInk.opacity(0.45), lineWidth: 1))
                }
                .buttonStyle(.orbitTile)

                Button { onDecide(false) } label: {
                    Text("Decline")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkSoft)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Capsule().strokeBorder(Color.orbitHairline, lineWidth: 1))
                }
                .buttonStyle(.orbitTile)
            }
        }
        .padding(OrbitMetric.cardPadding)
        .background {
            RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                .fill(Color.orbitSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                        .strokeBorder(Color.orbitHairline, lineWidth: 1)
                )
        }
    }
}
