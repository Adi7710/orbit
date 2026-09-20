import SwiftUI

/// The app's two screens. Today is the one the demo runs on; the map is the
/// one you open when the bus strip says to stand up.
///
/// `ios/README.md` said to reach `JourneyMapView` "from a tab or push it" and
/// there was no tab, so the map was only reachable by editing the root view.
/// This is that tab.
struct RootTabView: View {
    var body: some View {
        TabView {
            ScheduleOverviewView()
                .tabItem { Label("Today", systemImage: "circle.circle") }

            JourneyMapView()
                .tabItem { Label("Map", systemImage: "map") }
        }
        .tint(.orbitAccent)
    }
}
