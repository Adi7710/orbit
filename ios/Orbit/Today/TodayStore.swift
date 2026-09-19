import Foundation
import Observation

/// The Today screen's state.
///
/// `@Observable` rather than `ObservableObject` on purpose: SwiftUI tracks the
/// individual properties a view actually reads, so the XP toast appearing does
/// not invalidate the timeline deck, and a poll that returns an identical day
/// re-renders nothing. With `@Published` every one of these would be one
/// `objectWillChange` and the whole screen would rebuild.
@Observable
@MainActor
final class TodayStore {

    enum Phase: Equatable { case idle, loading, ready, failed(String) }

    private(set) var day: Today?
    private(set) var phase: Phase = .idle
    /// Set when we are showing a cached day because the server could not be
    /// reached. Never silent: the rule is degrade visibly.
    private(set) var staleBanner: String?
    private(set) var toast: Toast?
    private(set) var isWorking = false

    /// "Not now" on a suggestion. Client-side only and deliberately so: there
    /// is no endpoint that dismisses a pick, and inventing one would make the
    /// phone disagree with the web page. Cleared by pull-to-refresh.
    private(set) var dismissedGapIDs: Set<String> = []

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let lines: [String]
        let tone: Tone
        enum Tone { case xp, info, warning }
    }

    private let api = OrbitAPI.shared
    private let cacheKey = "orbit.today.lastPayload"

    // MARK: - Loading

    func refresh(showSpinner: Bool = false) async {
        if showSpinner, day == nil { phase = .loading }
        do {
            let (fresh, raw) = try await api.today()
            day = fresh
            phase = .ready
            staleBanner = nil
            dismissedGapIDs.removeAll()
            UserDefaults.standard.set(raw, forKey: cacheKey)
        } catch {
            if let cached = loadCache() {
                day = cached
                phase = .ready
                staleBanner = "Showing your last saved day — Orbit can't reach the server."
            } else {
                phase = .failed("Can't reach Orbit. Check ORBIT_API_BASE and that the server is running.")
            }
        }
    }

    /// Polls while the screen is on screen. Driven by `.task`, so SwiftUI
    /// cancels it on disappear and no timer outlives the view.
    func pollWhileVisible(every seconds: UInt64 = 30) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            await refresh()
        }
    }

    private func loadCache() -> Today? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey) else { return nil }
        return try? JSONDecoder().decode(Today.self, from: data)
    }

    // MARK: - Actions

    func complete(taskId: String, title: String, actualMinutes: Int) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await api.complete(taskId: taskId, actualMinutes: actualMinutes)
            toast = Toast(title: "+\(result.xp) XP", lines: result.reasons, tone: .xp)
            await refresh()
        } catch let error as OrbitAPI.HTTPError where error.isConflict {
            toast = Toast(title: "Already done", lines: ["\(title) was completed somewhere else."], tone: .warning)
            await refresh()
        } catch {
            toast = Toast(title: "Didn't save", lines: ["Orbit couldn't reach the server."], tone: .warning)
        }
    }

    func planMyDay() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await api.plan()
            toast = Toast(
                title: "\(result.proposals.count) proposal\(result.proposals.count == 1 ? "" : "s")",
                lines: [result.narration, "via \(result.provider)"].filter { !$0.isEmpty },
                tone: .info
            )
            await refresh()
        } catch {
            toast = Toast(title: "No plan", lines: ["Orbit couldn't reach the Day Agent."], tone: .warning)
        }
    }

    func decide(proposalId: String, approve: Bool) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await api.decide(proposalId: proposalId, approve: approve)
            toast = Toast(title: approve ? "Approved" : "Declined", lines: [result.effect].compactMap { $0 }, tone: .info)
            await refresh()
        } catch let error as OrbitAPI.HTTPError where error.isConflict {
            toast = Toast(title: "Already decided", lines: ["Someone answered this one already."], tone: .warning)
            await refresh()
        } catch {
            toast = Toast(title: "Didn't save", lines: ["Orbit couldn't reach the server."], tone: .warning)
        }
    }

    func setMode(_ mode: Today.Mode) async {
        do {
            _ = try await api.setMode(mode)
            await refresh()
        } catch {
            toast = Toast(title: "Mode unchanged", lines: ["Orbit couldn't reach the server."], tone: .warning)
        }
    }

    func dismissGap(_ id: String) { dismissedGapIDs.insert(id) }
    func clearToast() { toast = nil }
}
