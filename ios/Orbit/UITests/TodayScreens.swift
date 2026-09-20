import XCTest

/// Not a test of behaviour — a driver.
///
/// macOS blocks scripted mouse input to the Simulator without accessibility
/// permission, so this is how the screen gets scrolled, tapped and swiped
/// during a build check, and how the screenshots for a PR get taken. It
/// asserts only that the screen actually arrived; everything else it does is
/// capture what is on it.
final class TodayScreens: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        if name.contains("VoiceLive") { app.launchArguments = ["-orbit-voice-preview"] }
        app.launch()
    }

    private func snap(_ name: String) { attach(XCUIScreen.main.screenshot(), name) }

    private func attach(_ screenshot: XCUIScreenshot, _ name: String) {
        let shot = XCTAttachment(screenshot: screenshot)
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// The ledger rings are the proof the API answered and decoded: their
    /// accessibility label reads "Of 16h 30m awake, 9h 07m is actually usable"
    /// and is written from server numbers. The rings are one accessibility
    /// element (children ignored), so they are not a staticText; match any
    /// descendant, case-insensitively. The two reading cards this used to
    /// match were removed on 20 Sept.
    private var ledgerHeading: XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "actually usable")).firstMatch
    }

    func testToday() {
        if !ledgerHeading.waitForExistence(timeout: 25) {
            snap("00-nothing-rendered")
            print(app.debugDescription)
            return XCTFail("Today never rendered — check the server and ORBIT_API_BASE")
        }
        sleep(2)                      // let the dial finish sweeping
        snap("01-today-top")

        let list = app.collectionViews.firstMatch.exists
            ? app.collectionViews.firstMatch
            : app.tables.firstMatch

        list.swipeUp(velocity: .slow)
        sleep(1)
        snap("02-day-deck")

        list.swipeUp(velocity: .slow)
        sleep(1)
        snap("03-windows-and-bus")

        list.swipeUp(velocity: .slow)
        sleep(1)
        snap("04-quests-and-friends")
    }

    /// The voice sheet, from the dock.
    func testVoiceSheet() {
        XCTAssertTrue(ledgerHeading.waitForExistence(timeout: 25))
        sleep(2)
        let mic = app.buttons["Talk to Orbit"]
        guard mic.waitForExistence(timeout: 5) else {
            snap("08-no-mic-button")
            return XCTFail("No voice button in the dock")
        }
        snap("08-dock")
        mic.tap()
        sleep(4)
        snap("09-voice-sheet")

        // With no ElevenLabs key on the server this is the state the demo
        // machine is actually in, so it is the one worth photographing: the
        // day still readable, Orbit's own voice offered, and -- when the
        // server 503s -- a reason said out loud rather than a silent button.
        let hear = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Hear your day")).firstMatch
        if hear.waitForExistence(timeout: 5) {
            hear.tap()
            sleep(5)
            snap("09b-voice-speak-attempt")
        }
    }

    /// The listening state. Needs an ElevenLabs key to reach for real, so the
    /// session is put into a live state by launch argument and the gesture,
    /// the orb and the transcript below it are the genuine ones.
    func testVoiceLiveStates() {
        XCTAssertTrue(ledgerHeading.waitForExistence(timeout: 25))
        sleep(2)
        app.buttons["Talk to Orbit"].tap()
        sleep(2)
        snap("10-voice-live")

        let orb = app.buttons["Hold to talk"].firstMatch.exists
            ? app.buttons["Hold to talk"].firstMatch
            : app.otherElements["Hold to talk"].firstMatch
        guard orb.waitForExistence(timeout: 5) else {
            snap("11-no-orb")
            return XCTFail("No orb to hold")
        }
        // A real press on the real gesture. Events have to be posted from the
        // main thread and `press(forDuration:)` does not return until it lets
        // go, so the camera is what moves off it: the screenshot is taken while
        // the finger is still down.
        var midHold: XCUIScreenshot?
        let taken = expectation(description: "photographed mid-hold")
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.2) {
            midHold = XCUIScreen.main.screenshot()
            taken.fulfill()
        }
        orb.press(forDuration: 3)
        wait(for: [taken], timeout: 15)
        if let midHold { attach(midHold, "11-voice-listening") }
        sleep(1)
        snap("12-voice-after-release")
    }

    /// Tapping a class tile should grow it into the detail view.
    func testClassDetail() {
        XCTAssertTrue(ledgerHeading.waitForExistence(timeout: 25))
        sleep(2)
        let list = app.collectionViews.firstMatch
        list.swipeUp(velocity: .slow)
        sleep(1)

        let tile = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "CS 0441")).firstMatch
        guard tile.waitForExistence(timeout: 5) else {
            snap("05-no-class-tile")
            return XCTFail("No class tile in the deck")
        }
        tile.tap()
        sleep(2)
        snap("05-class-detail")
    }

    /// The window rows carry a leading swipe action that opens the complete
    /// sheet. Both halves are captured.
    func testSwipeToDone() {
        XCTAssertTrue(ledgerHeading.waitForExistence(timeout: 25))
        sleep(2)
        // Scroll until the row is on screen rather than a fixed number of
        // swipes: how far one swipe travels depends on how much day there is,
        // and a fixed count either stops short or sails past the windows.
        let list = app.collectionViews.firstMatch
        // Matched case-insensitively: `.orbitEyebrow()` uppercases the label,
        // and that reaches the accessibility label too, so the button answers
        // to "DONE" and not to "Done".
        let done = app.buttons.matching(NSPredicate(format: "label ==[c] %@", "Done")).firstMatch
        var swipes = 0
        while !done.isHittable, swipes < 6 {
            list.swipeUp(velocity: .slow)
            sleep(1)
            swipes += 1
        }
        guard done.isHittable else {
            snap("06-no-window-row")
            // Not a failure. "Nothing fits today. Enjoy it." is a real state
            // the server returns -- late at night the day is genuinely over,
            // and it is one of the states this screen exists to render. A
            // build check that goes red because of the time of day teaches
            // people to ignore it.
            let empty = app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "Nothing fits", "cleared the board")
            ).firstMatch
            XCTAssertTrue(empty.exists, "No window row with a pick, and no empty-state copy either")
            return
        }
        snap("06-windows")
        done.tap()
        sleep(2)
        snap("07-complete-sheet")
    }

    /// The travel plan sheet on Map is presented with `isPresented:
    /// .constant(true)` and `interactiveDismissDisabled()`, which means
    /// nothing can ever take it down -- including leaving the tab. A sheet is
    /// presented on the window, not inside the tab that asked for it, so it
    /// keeps sitting over Today after you have walked away from the map.
    func testTravelPlanSheetLeavesWithTheMapTab() {
        guard ledgerHeading.waitForExistence(timeout: 25) else {
            return XCTFail("Today never rendered — check the server and ORBIT_API_BASE")
        }

        let plan = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH[c] %@ OR label BEGINSWITH[c] %@", "Leave in", "Leave now"))
            .firstMatch

        XCTAssertFalse(plan.exists, "the travel plan is on Today before the map has ever been opened")

        app.buttons["Map"].tap()
        XCTAssertTrue(plan.waitForExistence(timeout: 20), "the travel plan never appeared on Map")
        snap("map-with-plan")

        app.buttons["Today"].tap()
        snap("today-after-map")
        XCTAssertFalse(
            plan.waitForExistence(timeout: 3),
            "the travel plan sheet is still over Today after leaving the map"
        )
    }
}
