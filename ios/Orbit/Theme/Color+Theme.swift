import SwiftUI
import UIKit

/// Orbit's design tokens.
///
/// One file, no asset catalog: every token is a dynamic `UIColor` that resolves
/// per trait collection, so light and dark are decided by the system at draw
/// time rather than by a `@Environment(\.colorScheme)` read that would force a
/// view to re-evaluate on every appearance change.
///
/// The look is derived from the Homely smart-home concept by Varti Studio,
/// adopted by Adi on 19 Sept. What was taken is the *language*, not the
/// artwork: a true near-black ground, a warm bone light mode, one acid-lime
/// accent spent on a single element per screen, a tight grotesque instead of a
/// rounded face, and soft bloom rather than hard shadow. None of their layouts
/// or assets are reproduced.
///
/// These values deliberately do NOT match `docs/theme.md`, which the web app
/// follows. See DECISIONS.md, 19 Sept 20:05.
enum OrbitToken {

    // MARK: Ground and surfaces

    /// True black-ish, not navy. The whole look rests on the ground being
    /// neutral: any blue in it turns the lime accent municipal-green.
    static let obsidian: UInt32 = 0x070708
    static let obsidianRaised: UInt32 = 0x131315
    static let obsidianInset: UInt32 = 0x1B1B1E

    /// Warm bone, not white. Light mode in this system is paper, not screen.
    static let bone: UInt32 = 0xEFEDE8
    static let boneRaised: UInt32 = 0xFFFFFF
    static let boneInset: UInt32 = 0xE6E3DC

    // MARK: Accent

    /// The acid lime. It is a FILL colour, always carrying `onAccent` text —
    /// as text on bone it is 1.04:1, which is invisible. Anywhere the accent
    /// has to *be* the text, use `accentInk`.
    static let lime: UInt32 = 0xD4F34A
    static let limeDeep: UInt32 = 0x5A6B0E
    /// Near-black for text and icons sitting on lime.
    static let onLime: UInt32 = 0x0A0A0A

    /// The second accent: warm orange, for the genuinely urgent.
    static let ember: UInt32 = 0xF4722C
    static let emberDeep: UInt32 = 0xA8410A

    // MARK: Domain hues

    /// Four domains in a world that is otherwise neutral plus lime plus orange.
    /// Teal and rose are the two additions, kept low-saturation so they sit in
    /// the same room. Each dark value clears 7:1 on the raised surface and each
    /// light value clears 5:1 on bone.
    static let teal: UInt32 = 0x5FBFA8
    static let tealDeep: UInt32 = 0x12695A
    static let rose: UInt32 = 0xE2899B
    static let roseDeep: UInt32 = 0x9B3A4E

    // MARK: Ink

    static let inkDark: UInt32 = 0xF4F4F2
    static let inkLight: UInt32 = 0x111111
    static let ink2Dark: UInt32 = 0xA0A09B
    static let ink2Light: UInt32 = 0x55554F
    static let ink3Dark: UInt32 = 0x85857F
    static let ink3Light: UInt32 = 0x6B6B66
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// A token that resolves itself against the trait collection at draw time.
    static func orbit(light: UInt32, dark: UInt32, opacity: Double = 1) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light, opacity: opacity))
        })
    }
}

// MARK: - Semantic colours

extension Color {
    static let orbitBackground = Color.orbit(light: OrbitToken.bone, dark: OrbitToken.obsidian)
    /// The plate a card sits on. Opaque: an opaque fill is one blend, a
    /// material is a blur pass.
    static let orbitSurface = Color.orbit(light: OrbitToken.boneRaised, dark: OrbitToken.obsidianRaised)
    /// Wells, tracks, tab strips — a step *into* the page rather than out of it.
    static let orbitSurfaceInset = Color.orbit(light: OrbitToken.boneInset, dark: OrbitToken.obsidianInset)
    static let orbitHairline = Color.orbit(light: 0x111111, dark: 0xFFFFFF, opacity: 0.09)

    /// The lime. A fill, spent once per screen. Pair with `orbitOnAccent`.
    static let orbitAccent = Color(hex: OrbitToken.lime)
    static let orbitOnAccent = Color(hex: OrbitToken.onLime)
    /// The accent when it has to be text or a stroke rather than a fill.
    static let orbitAccentInk = Color.orbit(light: OrbitToken.limeDeep, dark: OrbitToken.lime)

    static let orbitUrgent = Color.orbit(light: OrbitToken.emberDeep, dark: OrbitToken.ember)
    /// Kept as a name the rest of the app already uses. In this system "live"
    /// is carried by the lime, not by a third hue.
    static let orbitLive = Color.orbit(light: OrbitToken.limeDeep, dark: OrbitToken.lime)

    static let orbitInk = Color.orbit(light: OrbitToken.inkLight, dark: OrbitToken.inkDark)
    static let orbitInkSoft = Color.orbit(light: OrbitToken.ink2Light, dark: OrbitToken.ink2Dark)
    static let orbitInkFaint = Color.orbit(light: OrbitToken.ink3Light, dark: OrbitToken.ink3Dark)

    /// Ring and spine colour per domain, matching `Domain` in `src/core/types.ts`.
    static func orbitDomain(_ domain: String) -> Color {
        switch domain {
        case "learn": return .orbit(light: OrbitToken.limeDeep, dark: OrbitToken.lime)
        case "build": return .orbit(light: OrbitToken.emberDeep, dark: OrbitToken.ember)
        case "body":  return .orbit(light: OrbitToken.tealDeep, dark: OrbitToken.teal)
        case "life":  return .orbit(light: OrbitToken.roseDeep, dark: OrbitToken.rose)
        default:      return .orbitInkSoft
        }
    }
}

// MARK: - Gradients

extension LinearGradient {
    /// Primary call to action: flat lime, a whisper of a sheen. Homely's
    /// buttons are flat; the gradient exists only so the capsule does not look
    /// like a sticker.
    static let orbitAccent = LinearGradient(
        colors: [Color(hex: OrbitToken.lime), Color(hex: 0xC3E43A)],
        startPoint: .top,
        endPoint: .bottom
    )

    /// The one-pixel lit edge that lifts a tile off a black ground.
    static let orbitEdge = LinearGradient(
        colors: [Color.white.opacity(0.16), Color.white.opacity(0.03)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static func tintedEdge(_ tint: Color) -> LinearGradient {
        LinearGradient(
            colors: [tint.opacity(0.50), tint.opacity(0.06)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static func orbitDomainEdge(_ domain: String) -> LinearGradient {
        tintedEdge(Color.orbitDomain(domain))
    }
}

// MARK: - Type scale

extension Font {
    /// A grotesque, not a rounded face: SF Pro's default design is the system's
    /// closest relative to the Helvetica-Now-ish face the reference uses.
    /// Everything is built from a text style, so Dynamic Type still scales it.
    static let orbitDisplay = Font.system(.largeTitle, design: .default, weight: .bold)
    static let orbitTitle = Font.system(.title2, design: .default, weight: .semibold)
    static let orbitHeadline = Font.system(.headline, design: .default, weight: .semibold)
    static let orbitBody = Font.system(.subheadline, design: .default, weight: .regular)
    /// Eyebrow labels: small, uppercase, widely tracked. Applied with
    /// `.orbitEyebrow()` so the tracking travels with the size.
    static let orbitCaption = Font.system(.caption, design: .default, weight: .medium)
    /// Clock faces and minute counts.
    static let orbitNumeric = Font.system(.title3, design: .default, weight: .semibold).monospacedDigit()
}

extension View {
    /// The wide-tracked uppercase label the reference puts at the top of every
    /// section. Tracking, not `kerning`, so it scales with Dynamic Type.
    func orbitEyebrow() -> some View {
        self.font(.system(.caption2, design: .default, weight: .semibold))
            .textCase(.uppercase)
            .tracking(1.3)
    }

    /// Display copy in the reference is set tight. At large sizes the system
    /// default is a touch loose for this look.
    func orbitTightDisplay() -> some View {
        self.tracking(-0.8)
    }
}

// MARK: - Metrics

enum OrbitMetric {
    /// Homely's tiles are noticeably rounder than a standard iOS card.
    static let tileRadius: CGFloat = 26
    static let cardRadius: CGFloat = 26
    static let chipRadius: CGFloat = 18
    static let cardPadding: CGFloat = 16
    static let tileHeight: CGFloat = 148
    static let deckCardWidth: CGFloat = 214
    static let stackSpacing: CGFloat = 10
}
