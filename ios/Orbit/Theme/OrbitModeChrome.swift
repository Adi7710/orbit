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
/// Every accent is a light fill carrying near-black ink, which is the rule the
/// lime already follows — see `Color.orbitOnAccent`. Nothing here is a number
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
                accent: Color(hex: OrbitToken.lime),
                onAccent: Color(hex: OrbitToken.onLime),
                corner: OrbitMetric.cardRadius,
                titleWeight: .semibold,
                titleWidth: .standard,
                titleTracking: -0.8,
                shouts: false,
                animation: reduceMotion ? nil : .snappy(duration: 0.30)
            )

        // Sharp corners, condensed and heavy, and the quickest settle of the
        // three. Ember rather than lime: the day is not normal and the chrome
        // should not pretend otherwise.
        case .crisis:
            return OrbitModeChrome(
                accent: Color(hex: OrbitToken.ember),
                onAccent: Color(hex: OrbitToken.onLime),
                corner: 8,
                titleWeight: .heavy,
                titleWidth: .condensed,
                titleTracking: 0.6,
                shouts: true,
                animation: reduceMotion ? nil : .snappy(duration: 0.18)
            )

        // Soft everything: generous corners, a lighter face, a teal that sits
        // back instead of asking for anything, and the slowest settle.
        case .chill:
            return OrbitModeChrome(
                accent: Color(hex: OrbitToken.teal),
                onAccent: Color(hex: OrbitToken.onLime),
                corner: 34,
                titleWeight: .medium,
                titleWidth: .standard,
                titleTracking: 0,
                shouts: false,
                animation: reduceMotion ? nil : .smooth(duration: 0.55)
            )
        }
    }
}
