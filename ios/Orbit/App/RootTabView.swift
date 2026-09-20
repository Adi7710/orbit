import SwiftUI

/// The app's four tabs. Today is the one the demo runs on; Calendar is where
/// the timetable comes from; the map is the one you open when the bus row says
/// to stand up; Settings is who you are and which server this build talks to.
///
/// The selection is owned here so a screen can send the student back to Today
/// without knowing it lives in a tab bar -- the map's "Today" button does
/// exactly that.
struct RootTabView: View {

    enum Tab: Hashable { case today, crew, calendar, map, settings }

    @State private var tab: Tab = .today
    /// Mirrors the day's mode so the tab bar is tinted with it. Today owns
    /// the truth and writes it here.
    @State private var mode: Today.Mode = .normal

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TabView(selection: $tab) {
            ScheduleOverviewView(appMode: $mode)
                .tabItem { Label("Today", systemImage: "circle.circle") }
                .tag(Tab.today)

            CrewView()
                .tabItem { Label("Crew", systemImage: "person.3") }
                .tag(Tab.crew)

            CalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }
                .tag(Tab.calendar)

            JourneyMapView(onHome: { tab = .today })
                .tabItem { Label("Map", systemImage: "map") }
                .tag(Tab.map)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(Tab.settings)
        }
        .tint(OrbitModeChrome.on(mode, reduceMotion: reduceMotion).accent)
        .animation(OrbitModeChrome.on(mode, reduceMotion: reduceMotion).animation, value: mode)
    }
}
