import SwiftUI

/// One class in the day deck.
///
/// Three performance decisions worth knowing before editing this file:
///
/// 1. The frosted material is applied to **one** card — the one in progress —
///    and only when the system is not asking for reduced transparency. Every
///    other card gets an opaque fill. A material is a live blur of whatever is
///    behind it, re-sampled as the deck scrolls; a dozen of them is how a
///    120Hz list becomes a 40Hz list.
/// 2. Shadows are drawn as `ShapeStyle.shadow(.drop)` / `.shadow(.inner)` on
///    the fill rather than as a `.shadow()` view modifier. The shape renderer
///    draws these inline; the view modifier renders the subtree offscreen
///    first.
/// 3. The pulsing glow is a `PhaseAnimator` that exists only on the in-progress
///    card, and not at all under Reduce Motion.
struct ClassCardView: View {
    let block: Today.DayBlock
    /// Shared with the detail view so the card becomes the sheet rather than
    /// cross-fading into one.
    let namespace: Namespace.ID
    /// True while this card is the one expanded into the detail view; its
    /// contents step aside so the geometry match has something to fly from.
    var isSource: Bool = true
    var onTap: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    private var isLive: Bool { block.status == .now }
    private var isDone: Bool { block.status == .done }

    private var tint: Color {
        switch block.status {
        case .now:   return .orbitLive
        case .next:  return .orbitAccent
        case .done:  return .orbitInkFaint
        case .later: return .orbitInkSoft
        }
    }

    private var badge: (text: String, icon: String)? {
        switch block.status {
        case .now:   return ("In Progress", "dot.radiowaves.left.and.right")
        case .next:  return ("Up Next", "arrow.forward")
        case .done:  return ("Finished", "checkmark")
        case .later: return nil
        }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                header
                title
                Spacer(minLength: 0)
                footer
            }
            .padding(OrbitMetric.cardPadding)
            .frame(width: OrbitMetric.deckCardWidth, height: 168, alignment: .leading)
            .background(cardBackground)
            .overlay(alignment: .leading) { domainSpine }
            .clipShape(RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous))
            .opacity(isDone ? 0.55 : 1)
            .opacity(isSource ? 1 : 0)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .top) {
            if let badge {
                GradientTagView(text: badge.text, tint: tint, systemImage: badge.icon, filled: isLive)
                    .modifier(PulseModifier(active: isLive && !reduceMotion, tint: tint))
            }
            Spacer(minLength: 4)
            if isLive, let progress = block.progress {
                CircularProgressRing(progress: progress, tint: tint, lineWidth: 4) {
                    // Server-computed. The phone never counts a minute down.
                    Text("\(block.remainingMinutes ?? 0)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitInk)
                }
                .frame(width: 34, height: 34)
            }
        }
    }

    private var title: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let code = block.courseCode {
                Text(code)
                    .font(.orbitCaption)
                    .foregroundStyle(tint)
            }
            Text(block.title)
                .font(.orbitHeadline)
                .foregroundStyle(Color.orbitInk)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .matchedGeometryEffect(id: "title-\(block.id)", in: namespace, isSource: isSource)
        }
    }

    private var footer: some View {
        HStack(spacing: 6) {
            Text("\(block.startText)–\(block.endText)")
                .font(.orbitBody)
                .monospacedDigit()
                .foregroundStyle(Color.orbitInkSoft)
            if let place = block.place {
                Text("·").foregroundStyle(Color.orbitInkFaint)
                Text(place)
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInkSoft)
                    .lineLimit(1)
            }
        }
    }

    /// A four-point bar of the course's colour. Cheaper than a tinted card and
    /// it survives being 55% transparent when the class is over.
    private var domainSpine: some View {
        Capsule()
            .fill(LinearGradient(colors: [tint, tint.opacity(0.25)], startPoint: .top, endPoint: .bottom))
            .frame(width: 4)
            .padding(.vertical, 14)
            .padding(.leading, 5)
            .opacity(isDone ? 0.4 : 1)
    }

    @ViewBuilder
    private var cardBackground: some View {
        let shape = RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
        ZStack {
            if isLive && !reduceTransparency {
                // The single blurred surface on this screen's scrolling content.
                shape.fill(.ultraThinMaterial)
                shape.fill(tint.opacity(0.10))
            } else {
                shape.fill(
                    Color.orbitSurface
                        .shadow(.drop(color: .black.opacity(0.18), radius: 10, y: 6))
                        .shadow(.inner(color: .white.opacity(0.06), radius: 1, y: 1))
                )
            }
            shape.strokeBorder(
                isLive ? LinearGradient.orbitDomainEdge("build") : LinearGradient.orbitEdge,
                lineWidth: 1
            )
        }
        .matchedGeometryEffect(id: "card-\(block.id)", in: namespace, isSource: isSource)
    }

    private var accessibilityText: String {
        var parts = [block.courseCode, block.title].compactMap { $0 }
        parts.append("\(block.startText) to \(block.endText)")
        if let place = block.place { parts.append("in \(place)") }
        switch block.status {
        case .now:   parts.append("in progress, \(block.remainingMinutes ?? 0) minutes left")
        case .next:  parts.append("up next")
        case .done:  parts.append("finished")
        case .later: break
        }
        return parts.joined(separator: ", ")
    }
}

/// The "it is happening right now" glow.
///
/// A two-phase `PhaseAnimator` driving one shadow radius. It is a modifier so
/// the animation can be switched off entirely — under Reduce Motion the
/// animator is never built, rather than built and set to zero duration.
private struct PulseModifier: ViewModifier {
    let active: Bool
    let tint: Color

    func body(content: Content) -> some View {
        if active {
            content.phaseAnimator([false, true]) { view, lit in
                view.shadow(color: tint.opacity(lit ? 0.75 : 0.15), radius: lit ? 9 : 3)
            } animation: { _ in
                .easeInOut(duration: 1.3)
            }
        } else {
            content
        }
    }
}
