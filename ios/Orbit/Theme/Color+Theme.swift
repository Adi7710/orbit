import SwiftUI
import UIKit

/// Orbit's design tokens.
///
/// One file, no asset catalog: every token is a dynamic `UIColor` that resolves
/// per trait collection, so light and dark are decided by the system at draw
/// time rather than by a `@Environment(\.colorScheme)` read that would force a
/// view to re-evaluate on every appearance change.
///
/// These values are the iOS half of the theme. When `docs/theme.md` lands
/// (Akshat's session owns it) the hex values below are the things to reconcile;
/// nothing else in the app hard-codes a colour.
enum OrbitToken {
    // Surfaces
    static let charcoal: UInt32 = 0x0B0D17   // deep cosmic charcoal, dark background
    static let charcoalLift: UInt32 = 0x141829
    static let polar: UInt32 = 0xF8F9FA      // crisp polar white, light background
    static let polarLift: UInt32 = 0xFFFFFF

    // Primary accent: cosmic indigo (light) / nebula blue (dark)
    static let indigo: UInt32 = 0x4F46E5
    static let nebula: UInt32 = 0x6366F1

    // Secondary accents
    static let amber: UInt32 = 0xF59E0B      // urgent, deadlines
    static let amberInk: UInt32 = 0xB45309   // amber that survives white behind it
    static let violet: UInt32 = 0xA855F7     // active, live, notifications
    static let violetInk: UInt32 = 0x7E22CE

    /// The fourth domain has no colour in the brief. Teal is the only hue left
    /// that stays distinguishable from indigo, violet and amber for the common
    /// forms of colour blindness. Logged in DECISIONS.md.
    static let teal: UInt32 = 0x2DD4BF
    static let tealInk: UInt32 = 0x0F766E
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
    static let orbitBackground = Color.orbit(light: OrbitToken.polar, dark: OrbitToken.charcoal)
    /// The plate a card sits on. Deliberately opaque: an opaque fill is one
    /// blend, a material is a blur pass.
    static let orbitSurface = Color.orbit(light: OrbitToken.polarLift, dark: OrbitToken.charcoalLift)
    static let orbitHairline = Color.orbit(light: 0x0B0D17, dark: 0xFFFFFF, opacity: 0.10)

    static let orbitAccent = Color.orbit(light: OrbitToken.indigo, dark: OrbitToken.nebula)
    static let orbitAccentSoft = Color.orbit(light: OrbitToken.nebula, dark: OrbitToken.indigo)
    static let orbitUrgent = Color.orbit(light: OrbitToken.amberInk, dark: OrbitToken.amber)
    static let orbitLive = Color.orbit(light: OrbitToken.violetInk, dark: OrbitToken.violet)

    static let orbitInk = Color.orbit(light: 0x111827, dark: 0xF3F4F6)
    static let orbitInkSoft = Color.orbit(light: 0x4B5563, dark: 0x9CA3AF)
    static let orbitInkFaint = Color.orbit(light: 0x9CA3AF, dark: 0x6B7280)

    /// Ring colour per domain, matching `Domain` in `src/core/types.ts`.
    static func orbitDomain(_ domain: String) -> Color {
        switch domain {
        case "learn": return .orbitAccent
        case "build": return .orbitLive
        case "body":  return .orbitUrgent
        case "life":  return .orbit(light: OrbitToken.tealInk, dark: OrbitToken.teal)
        default:      return .orbitInkSoft
        }
    }
}

// MARK: - Gradients

extension LinearGradient {
    /// Primary call to action.
    static let orbitAccent = LinearGradient(
        colors: [Color(hex: OrbitToken.indigo), Color(hex: OrbitToken.nebula)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// The one-pixel lit edge that makes a flat card read as glass. Cheaper
    /// than a shadow and it does not rasterise offscreen.
    static let orbitEdge = LinearGradient(
        colors: [Color.white.opacity(0.28), Color.white.opacity(0.04)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static func orbitDomainEdge(_ domain: String) -> LinearGradient {
        LinearGradient(
            colors: [Color.orbitDomain(domain).opacity(0.55), Color.orbitDomain(domain).opacity(0.08)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Type scale

extension Font {
    /// Rounded system faces throughout; all of these scale with Dynamic Type
    /// because they are built from text styles, not fixed point sizes.
    static let orbitDisplay = Font.system(.largeTitle, design: .rounded, weight: .bold)
    static let orbitTitle = Font.system(.title2, design: .rounded, weight: .bold)
    static let orbitHeadline = Font.system(.headline, design: .rounded, weight: .semibold)
    static let orbitBody = Font.system(.subheadline, design: .rounded, weight: .medium)
    static let orbitCaption = Font.system(.caption, design: .rounded, weight: .semibold)
    /// Clock faces and minute counts: monospaced digits so a ticking number
    /// does not shuffle the layout sideways every refresh.
    static let orbitNumeric = Font.system(.title3, design: .rounded, weight: .bold).monospacedDigit()
}

// MARK: - Metrics

enum OrbitMetric {
    static let cardRadius: CGFloat = 20
    static let cardPadding: CGFloat = 16
    static let deckCardWidth: CGFloat = 228
    static let stackSpacing: CGFloat = 12
}
