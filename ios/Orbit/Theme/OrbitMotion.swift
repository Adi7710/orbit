import SwiftUI

/// Every animation in the app, defined once.
///
/// Two reasons this is a file rather than a scattering of `.animation`
/// modifiers. The first is that a motion language is a design decision like a
/// colour, and a spring typed inline six times drifts into six springs. The
/// second is Reduce Motion: it is honoured *here*, so no call site can forget
/// it — `OrbitMotion.entrance(reduceMotion)` returns `nil` rather than a
/// zero-duration animation, and a nil animation means SwiftUI does not build
/// an animation at all.
enum OrbitMotion {

    /// Cards, tiles and sheets arriving. Slightly overdamped: the reference
    /// moves confidently and stops, it does not wobble.
    static let entranceSpring = Animation.spring(response: 0.52, dampingFraction: 0.86)
    /// A card growing into the detail view.
    static let heroSpring = Animation.spring(response: 0.38, dampingFraction: 0.82)
    /// Toggles, chips, selection.
    static let snapSpring = Animation.spring(response: 0.26, dampingFraction: 0.74)
    /// A value sweeping to a new position — a dial, a ring, a progress bar.
    static let sweepCurve = Animation.easeOut(duration: 0.75)
    /// The slow breath under a live element.
    static let breath = Animation.easeInOut(duration: 1.9)

    /// Each successive section waits this much longer before arriving.
    static let stagger: Double = 0.055
    /// Beyond this many steps the stagger stops accumulating, so a long day
    /// does not make the last card arrive a second and a half late.
    static let staggerCap: Int = 8

    static func entrance(_ reduceMotion: Bool) -> Animation? { reduceMotion ? nil : entranceSpring }
    static func hero(_ reduceMotion: Bool) -> Animation? { reduceMotion ? nil : heroSpring }
    static func snap(_ reduceMotion: Bool) -> Animation? { reduceMotion ? nil : snapSpring }
    static func sweep(_ reduceMotion: Bool) -> Animation? { reduceMotion ? nil : sweepCurve }

    static func delay(for index: Int) -> Double {
        Double(min(index, staggerCap)) * stagger
    }
}

// MARK: - Press

/// A tile that acknowledges the finger.
///
/// Scale only — no frame change, so pressing a tile costs one composited
/// transform and never re-runs layout on the grid around it.
struct OrbitTileButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var scale: CGFloat = 0.965

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
            .animation(OrbitMotion.snap(reduceMotion), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == OrbitTileButtonStyle {
    static var orbitTile: OrbitTileButtonStyle { OrbitTileButtonStyle() }
}

// MARK: - Entrance

/// Fade and rise, staggered by position in the list.
///
/// The reference's screens assemble themselves rather than appearing whole.
/// This is that, done cheaply: opacity and offset are both composited, so a
/// staggered entrance across a dozen tiles is still one layout pass.
struct OrbitAppear: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 14)
            .onAppear {
                guard !shown else { return }
                if reduceMotion {
                    shown = true
                } else {
                    withAnimation(OrbitMotion.entranceSpring.delay(OrbitMotion.delay(for: index))) {
                        shown = true
                    }
                }
            }
    }
}

// MARK: - Bloom

/// The soft halo the reference puts under anything live.
///
/// It is a shadow whose radius and opacity breathe, applied to one element at
/// a time. A `PhaseAnimator` rather than a repeating `withAnimation` so the
/// animation is owned by the view and dies with it, and so that under Reduce
/// Motion the animator is never constructed.
struct OrbitBloom: ViewModifier {
    let tint: Color
    var active: Bool = true
    var radius: CGFloat = 16
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if active && !reduceMotion {
            content.phaseAnimator([false, true]) { view, lit in
                view.shadow(color: tint.opacity(lit ? 0.55 : 0.18), radius: lit ? radius : radius * 0.45)
            } animation: { _ in
                OrbitMotion.breath
            }
        } else if active {
            content.shadow(color: tint.opacity(0.35), radius: radius * 0.6)
        } else {
            content
        }
    }
}

extension View {
    /// Staggered fade-and-rise. `index` is the element's position in its group.
    func orbitAppear(_ index: Int = 0) -> some View {
        modifier(OrbitAppear(index: index))
    }

    /// A breathing halo. Spend it on one element per screen.
    func orbitBloom(_ tint: Color, active: Bool = true, radius: CGFloat = 16) -> some View {
        modifier(OrbitBloom(tint: tint, active: active, radius: radius))
    }
}
