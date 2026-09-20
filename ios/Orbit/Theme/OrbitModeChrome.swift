import SwiftUI

/// What a mode is allowed to change about the screen, and what it is not.
///
/// Orbit's three modes are not three colour schemes. Crisis has to read as a
/// different instrument from Chill before a single word is read, and the way
/// to say that without copy is to move what the eye takes in first: how tight
/// the corners are, how heavy and how narrow the display face is, whether
/// labels shout, and how fast anything settles.
///
/// What a mode may **not** change is what a colour means. The ledger rings keep
/// their hues in every mode, because a hue that means class here and meals
/// there means nothing anywhere. The accent moves; the encoding stays put.
///
/// Every accent is a saturated fill carrying white. Nothing here is a number
/// the server owns; this type only decides shape, weight and pace.
struct OrbitModeChrome {

    let accent: Color
    let onAccent: Color
    let corner: CGFloat
    let titleWeight: Font.Weight
    let titleWidth: Font.Width
    let titleTracking: CGFloat
    /// Crisis shouts its labels. The other two do not.
    let shouts: Bool
    /// Nil under Reduce Motion, so no call site has to remember.
    let animation: Animation?
    /// A wash over the whole page. Faint enough to read through, strong
    /// enough that changing mode is unmistakable from across a table.
    let wash: Color
    /// The ledger rings, one hue at four depths, in this mode's hue. Depth
    /// still encodes the band, so nothing a colour means has moved — only
    /// which hue the four depths are cut from. Every value clears 3:1 against
    /// its own ground as a graphic; the light set darkens toward black and the
    /// dark set lightens toward white, which is the construction the blue set
    /// was measured on.
    let ringLight: [UInt32]
    let ringDark: [UInt32]

    func title(_ style: Font.TextStyle = .title2) -> Font {
        Font.system(style, design: .default, weight: titleWeight).width(titleWidth)
    }

    func label(_ text: String) -> String {
        shouts ? text.uppercased() : text
    }

    static func on(_ mode: Today.Mode, reduceMotion: Bool) -> OrbitModeChrome {
        switch mode {
        case .normal:
            return OrbitModeChrome(
                accent: Color(hex: OrbitClassic.primary),
                onAccent: .white,
                corner: 14,
                titleWeight: .semibold,
                titleWidth: .standard,
                titleTracking: -0.8,
                shouts: false,
                animation: reduceMotion ? nil : .snappy(duration: 0.30),
                wash: .clear,
                // Measured: 4.65 / 6.81 / 9.94 / 13.64 on white,
                //           4.51 / 6.90 / 10.04 / 13.59 on black.
                ringLight: [0x2F6FE4, 0x2557B2, 0x1B4084, 0x132C5B],
                ringDark: [0x2F6FE4, 0x6393EB, 0x93B4F1, 0xBCD1F6]
            )

        // Sharp corners, condensed and heavy, and the quickest settle of the
        // three. Ember rather than lime: the day is not normal and the chrome
        // should not pretend otherwise.
        case .crisis:
            return OrbitModeChrome(
                accent: Color(hex: OrbitClassic.crisis),
                onAccent: .white,
                corner: 6,
                titleWeight: .heavy,
                titleWidth: .condensed,
                titleTracking: 0.6,
                shouts: true,
                animation: reduceMotion ? nil : .snappy(duration: 0.18),
                wash: Color(hex: OrbitClassic.crisis, opacity: 0.07),
                // 4.70 / 6.94 / 10.54 / 14.67 on white,
                // 4.47 / 6.28 / 9.94 / 14.71 on black.
                ringLight: [0xE11D48, 0xB01738, 0x7E1028, 0x530B1B],
                ringDark: [0xE11D48, 0xE95C7B, 0xF299AD, 0xF8CDD7]
            )

        // Soft everything: generous corners, a lighter face, a teal that sits
        // back instead of asking for anything, and the slowest settle.
        case .chill:
            return OrbitModeChrome(
                accent: Color(hex: OrbitClassic.chill),
                onAccent: .white,
                corner: 22,
                titleWeight: .medium,
                titleWidth: .standard,
                titleTracking: 0,
                shouts: false,
                animation: reduceMotion ? nil : .smooth(duration: 0.55),
                wash: Color(hex: OrbitClassic.chill, opacity: 0.09),
                // 3.55 / 5.41 / 8.60 / 12.74 on white,
                // 5.92 / 8.93 / 12.68 / 16.64 on black.
                ringLight: [0x6E8CA0, 0x566D7D, 0x3E4E5A, 0x29343B],
                ringDark: [0x6E8CA0, 0x97ACBB, 0xBECBD4, 0xDFE6EA]
            )
        }
    }
}
