import SwiftUI

/// One class, as a tile.
///
/// The accent rule this design runs on: **one lime element per screen.** The
/// class that is happening right now is that element — it is a solid lime tile
/// with near-black text, breathing gently. Every other tile is the plain
/// surface. That is what makes the live one findable in a glance, and it is
/// why the lime is never spent on a heading or a label elsewhere.
///
/// It also happens to be free. The previous version frosted the live card with
/// `.ultraThinMaterial`, which is a blur re-sampled on every frame of a scroll.
/// A flat lime fill is one blend, so the deck now has no blur in it at all.
struct ClassCardView: View {
    let block: Today.DayBlock
    /// Full width in a vertical stack; fixed width in the horizontal deck.
    var stacked: Bool = false
    /// Shared with the detail view so the tile becomes the sheet rather than
    /// cross-fading into one.
    let namespace: Namespace.ID
    /// True while this tile is the one expanded into the detail view; its
    /// contents step aside so the geometry match has something to fly from.
    var isSource: Bool = true
    /// Position in the deck, for the staggered entrance.
    var index: Int = 0
    var onTap: () -> Void = {}

    private var isLive: Bool { block.status == .now }
    private var isDone: Bool { block.status == .done }

    /// Ink that sits on this tile: near-black on lime, normal ink elsewhere.
    private var ink: Color { isLive ? .orbitOnAccent : .orbitInk }
    private var inkSoft: Color { isLive ? Color.orbitOnAccent.opacity(0.62) : .orbitInkFaint }

    private var statusLabel: String? {
        switch block.status {
        case .now:   return "In progress"
        case .next:  return "Up next"
        case .done:  return "Finished"
        case .later: return nil
        }
    }

    var body: some View {
        Button(action: onTap) {
            // Status at the top, identity at the bottom — the reference puts
            // the glyph in one corner and the name against the floor.
            VStack(alignment: .leading, spacing: 8) {
                header
                Spacer(minLength: 8)
                titleBlock
                footer
            }
            .padding(OrbitMetric.cardPadding)
            .frame(width: stacked ? nil : OrbitMetric.deckCardWidth,
                   height: 172, alignment: .leading)
            .frame(maxWidth: stacked ? .infinity : nil, alignment: .leading)
            .background(tileBackground)
            .clipShape(RoundedRectangle(cornerRadius: OrbitMetric.tileRadius, style: .continuous))
            .orbitBloom(.orbitAccent, active: isLive, radius: 18)
            .opacity(isDone ? 0.45 : 1)
            .opacity(isSource ? 1 : 0)
        }
        .buttonStyle(.orbitTile)
        .orbitAppear(index)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .top) {
            if let statusLabel {
                Text(statusLabel)
                    .orbitEyebrow()
                    .foregroundStyle(inkSoft)
            }
            Spacer(minLength: 4)
            if isLive, let progress = block.progress {
                RadialDialView(progress: progress, tint: .orbitOnAccent, tickCount: 24, lineWidth: 1.6, tickLength: 5) {
                    // Server-computed. The phone never counts a minute down.
                    Text("\(block.remainingMinutes ?? 0)")
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.orbitOnAccent)
                }
                .frame(width: 40, height: 40)
            }
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let code = block.courseCode {
                Text(code)
                    .orbitEyebrow()
                    .foregroundStyle(isLive ? Color.orbitOnAccent.opacity(0.72) : .orbitAccentInk)
            }
            Text(block.title)
                .font(.orbitHeadline)
                .orbitTightDisplay()
                .foregroundStyle(ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .matchedGeometryEffect(id: "title-\(block.id)", in: namespace, isSource: isSource)
        }
    }

    private var footer: some View {
        HStack(spacing: 5) {
            Text("\(block.startText)–\(block.endText)")
                .font(.orbitBody)
                .monospacedDigit()
            if let place = block.place {
                Text("·")
                Text(place).font(.orbitBody).lineLimit(1)
            }
        }
        .font(.orbitBody)
        .foregroundStyle(inkSoft)
    }

    @ViewBuilder
    private var tileBackground: some View {
        let shape = RoundedRectangle(cornerRadius: OrbitMetric.tileRadius, style: .continuous)
        ZStack {
            if isLive {
                shape.fill(LinearGradient.orbitAccent)
            } else {
                shape.fill(Color.orbitSurface)
                shape.strokeBorder(Color.orbitHairline, lineWidth: 1)
            }
        }
        // The anchor the detail view grows from.
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
