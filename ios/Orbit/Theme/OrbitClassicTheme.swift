import SwiftUI

/// The palette and chrome Orbit is being taken back to.
///
/// Written for this codebase tonight. It reproduces a *design* — four domain
/// hues, a blue primary, and three modes that change the chrome without ever
/// changing what a colour means — and none of its code; see the hard rule in
/// CLAUDE.md. Surfaces are the system's own, because the look sits on iOS
/// greys rather than on a bone/obsidian ground of its own invention.
enum OrbitClassic {

    // MARK: Domain hues

    /// Validated as a categorical set against both light and dark surfaces.
    /// LIFE is purple rather than amber: amber sat too close to BODY for a
    /// deuteranope to separate. Adjacent-pair separation is still near the
    /// floor, which is only legal alongside secondary encoding — so every
    /// chart drawn from these carries a direct label and a gap. Don't remove
    /// them.
    static let learn: UInt32 = 0x2F6FE4
    static let build: UInt32 = 0x0F9C8C
    static let body:  UInt32 = 0xE04A32
    static let life:  UInt32 = 0x9A4DBF

    // MARK: Mode accents

    static let primary: UInt32 = 0x2F6FE4
    static let crisis:  UInt32 = 0xE11D48
    /// Darkened from 6E8CA0 on 20 Sept: white text on the original was
    /// 3.55:1, which fails as text. This one is 4.95:1 with white and 4.24:1
    /// as an arc on black. See docs/theme.md section 2.2, run 2.
    static let chill:   UInt32 = 0x557488

    // MARK: Surfaces

    /// The page, and the plate a card sits on. The system's, so light and dark
    /// resolve without a token table of our own.
    static var ground: Color { Color(uiColor: .systemBackground) }
    static var surface: Color { Color(uiColor: .secondarySystemBackground) }
    static var surfaceDeep: Color { Color(uiColor: .tertiarySystemBackground) }

    static var ink: Color { Color(uiColor: .label) }
    static var inkSoft: Color { Color(uiColor: .secondaryLabel) }
    static var inkFaint: Color { Color(uiColor: .tertiaryLabel) }
    static var hairline: Color { Color(uiColor: .separator) }
}

extension Color {
    static let classicLearn = Color(hex: OrbitClassic.learn)
    static let classicBuild = Color(hex: OrbitClassic.build)
    static let classicBody  = Color(hex: OrbitClassic.body)
    static let classicLife  = Color(hex: OrbitClassic.life)
}

/// Durations are written the way the design writes them: `196` is "3h 16m",
/// `45` is "45m". This formats a number the server sent. It does not decide
/// what the number is.
enum OrbitDuration {
    static func hm(_ minutes: Int) -> String {
        let m = abs(minutes)
        let h = m / 60
        let rest = m % 60
        if h == 0 { return "\(rest)m" }
        if rest == 0 { return "\(h)h" }
        return "\(h)h \(rest)m"
    }
}
