import SwiftUI

/// The app.
///
/// Today is the root. `ScheduleOverviewView` is the screen the demo runs on;
/// `JourneyMapView` is the older map screen and is reached separately, never
/// as root — see `ios/README.md`.
@main
struct OrbitApp: App {
    var body: some Scene {
        WindowGroup {
            ScheduleOverviewView()
        }
    }
}
