import SwiftUI

/// The app shell. Everything else in `Orbit/` is views, models and theme; this
/// is the only entry point, and it stays this thin on purpose: the root view
/// owns its own store, so there is no dependency wiring to get wrong here.
@main
struct OrbitApp: App {
    var body: some Scene {
        WindowGroup {
            ScheduleOverviewView()
        }
    }
}
